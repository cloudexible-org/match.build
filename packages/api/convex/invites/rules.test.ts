import { describe, expect, test } from "vitest";
import { formatEmailDate, inviteEmail, inviteFrom } from "./rules";

describe("the invite email", () => {
  test("the sender is the matchmaker's name, unable to break out of its quotes", () => {
    expect(inviteFrom("Maya's Matches")).toBe(
      '"Maya\'s Matches" <invites@aileenlancif.com>',
    );
    expect(inviteFrom('Evil" <x@evil.test>\r\nBcc: y')).toBe(
      '"Evil x@evil.testBcc: y" <invites@aileenlancif.com>',
    );
    expect(inviteFrom(' "" ')).toBe(
      '"Your matchmaker" <invites@aileenlancif.com>',
    );
  });

  test("carries the link and expiry, with the name escaped in HTML", () => {
    const email = inviteEmail({
      matchmakerName: "<b>Maya</b>",
      link: "https://app.example.test/app/invite/abc",
      expiresAt: Date.UTC(2026, 9, 19, 23, 30),
    });
    expect(email.subject).toBe("<b>Maya</b> invited you to Matchmaker");
    expect(email.text).toContain(
      "Accept the invitation: https://app.example.test/app/invite/abc",
    );
    expect(email.text).toContain("The link works until 19 October 2026.");
    expect(email.html).toContain("&lt;b&gt;Maya&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Maya</b>");
  });

  test("dates are written out in UTC", () => {
    expect(formatEmailDate(Date.UTC(2027, 0, 1))).toBe("1 January 2027");
  });
});
