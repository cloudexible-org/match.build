import { expect, type Page, test } from "@playwright/test";
import { ConversationPage } from "../../page-objects/app/matchmaker.page";
import { SuggestionsPage } from "../../page-objects/app/suggestions.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Drafted replies above the composer (prd/phase-2.md §4A): Send, Edit,
 * Dismiss.
 *
 * **The drafts are seeded, and they have to be.** Generating one needs the
 * Convex AI gateway, which needs a paid Convex Cloud deployment; this suite
 * runs against a local anonymous backend where AI is off and staying off. So
 * what is covered here is everything after the model returns — which is all of
 * the part a matchmaker touches. The generation itself is covered by
 * `convex/replySuggestions/rules.test.ts` (what is sent, and how the reply is
 * read back) and `mutations.test.ts` (the debounce, staleness, and the four
 * ways a draft is answered).
 *
 * One candidate per test that answers anything.
 */

let world: Scenario;

const DRAFTS = [
  "Lovely to hear from you, Sam.",
  "That's great — tell me more about the hiking.",
  "Sounds like a good weekend. What's next?",
];

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "sam", name: "Sam Member" },
      { key: "dee", name: "Dee Member" },
      { key: "eddie", name: "Eddie Member" },
      { key: "fran", name: "Fran Member" },
      { key: "quinn", name: "Quinn Member" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "send",
        matchmakerKey: "book",
        userKey: "sam",
        membership: "joined",
        name: "Sam Member",
        messages: [
          {
            author: "candidate",
            visibility: "everyone",
            body: "Hello! I love hiking.",
          },
        ],
        replyDrafts: DRAFTS,
      },
      {
        key: "dismiss",
        matchmakerKey: "book",
        userKey: "dee",
        membership: "joined",
        name: "Dee Member",
        replyDrafts: DRAFTS,
      },
      {
        key: "edit",
        matchmakerKey: "book",
        userKey: "eddie",
        membership: "joined",
        name: "Eddie Member",
        replyDrafts: ["Lovely to hear from you."],
      },
      {
        key: "typing",
        matchmakerKey: "book",
        userKey: "fran",
        membership: "joined",
        name: "Fran Member",
        replyDrafts: ["Lovely to hear from you."],
      },
      {
        key: "quiet",
        matchmakerKey: "book",
        userKey: "quinn",
        membership: "joined",
        name: "Quinn Member",
      },
    ],
  });
});

async function openConversation(page: Page, candidate: string) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(candidate)}`,
  );
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
  return new SuggestionsPage(page);
}

test("three drafts are one row, newest showing, with arrows through the rest", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "send");

  await expect(suggestions.getRow("reply")).toBeVisible();
  await expect(suggestions.getCounter("reply")).toHaveText("1/3");
  // Seeded a millisecond apart, so the last one listed is the newest.
  await expect(suggestions.getCard("reply")).toContainText(DRAFTS[2]);

  await suggestions.goOlder("reply");
  await expect(suggestions.getCard("reply")).toContainText(DRAFTS[1]);
  await expect(suggestions.getCounter("reply")).toHaveText("2/3");
});

test("a draft is sent as an ordinary message, and the rest are retired", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "send");
  const conversation = new ConversationPage(page);

  const before = await conversation.getMessages().count();
  await suggestions.accept("reply"); // Send

  // It lands in the thread as the matchmaker's own words. Nothing about it
  // says "drafted" — the candidate cannot tell, and that is the point.
  await expect(conversation.getMessages()).toHaveCount(before + 1);
  await expect(conversation.getMessages().last()).toContainText(DRAFTS[2]);

  // Sending one answers all three: the others were alternatives to it.
  await expect(suggestions.getRow("reply")).toHaveCount(0);
});

test("Edit puts the draft in the composer and leaves it on offer", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "edit");
  const conversation = new ConversationPage(page);

  await suggestions.edit("reply");
  await expect(conversation.getMessageInput()).toHaveValue(
    "Lovely to hear from you.",
  );
  // Editing is not answering: change your mind and the original is still there.
  await expect(suggestions.getCard("reply")).toBeVisible();

  await conversation.getMessageInput().fill("Lovely to hear from you, Eddie!");
  await conversation.getMessageInput().press("Enter");
  await expect(conversation.getMessages().last()).toContainText(
    "Lovely to hear from you, Eddie!",
  );
});

test("Edit never writes over something already being typed", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "typing");
  const conversation = new ConversationPage(page);

  await conversation.getMessageInput().fill("I was halfway through this");
  await suggestions.edit("reply");
  await expect(conversation.getMessageInput()).toHaveValue(
    "I was halfway through this",
  );
});

test("dismissing takes only the draft showing", async ({ page }) => {
  const suggestions = await openConversation(page, "dismiss");

  await expect(suggestions.getCounter("reply")).toHaveText("1/3");
  await suggestions.dismiss("reply");
  await expect(suggestions.getCounter("reply")).toHaveText("1/2");

  // Gone for good, not merely skipped.
  await page.reload();
  await expect(suggestions.getCounter("reply")).toHaveText("1/2");
});

test("a new message retires the drafts that answered the old one", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "dismiss");
  const conversation = new ConversationPage(page);

  await expect(suggestions.getRow("reply")).toBeVisible();
  await conversation
    .getMessageInput()
    .fill("Actually, let me say this myself.");
  await conversation.getMessageInput().press("Enter");

  // A draft written before that message is not a reply to it.
  await expect(suggestions.getRow("reply")).toHaveCount(0);
});

test("the header switch is hidden where no agent could run", async ({
  page,
}) => {
  await openConversation(page, "quiet");
  const conversation = new ConversationPage(page);
  // This backend has no gateway, so `enabledFor.available` is false and the
  // switch is not rendered: a control that cannot work invites somebody to
  // press it twice and wonder.
  await expect(conversation.getSuggestionsToggle()).toHaveCount(0);
  // The conversation is the phase-1 one, entirely unaffected.
  await expect(conversation.getComposer()).toBeVisible();
});

test("no drafts, no row — and the AI being off is not an error", async ({
  page,
}) => {
  const suggestions = await openConversation(page, "quiet");
  // This backend has no gateway at all, so nothing will ever draft here. The
  // conversation is the phase-1 one, working exactly as it did.
  await expect(suggestions.getRow("reply")).toHaveCount(0);
  await expect(new ConversationPage(page).getComposer()).toBeVisible();
});
