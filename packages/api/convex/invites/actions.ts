import { v } from "convex/values";
import { internal } from "../_generated/api";
import { env, internalAction } from "../_generated/server";
import { sendEmail as deliver } from "../email/helpers";
import { inviteTokenFor } from "./helpers";
import { inviteEmail, inviteFrom, invitePath } from "./rules";

/**
 * Sends one invite's email, scheduled by the mutation that opened or resent
 * it (`sendInvite` in ./helpers.ts). Does nothing if that invite has since
 * been accepted, declined, revoked, expired or replaced, so a stale send
 * never mails a dead link.
 *
 * The link is `SITE_URL` (the app's URL, set by `auth:setup`) plus the
 * token, which is re-derived here rather than passed in, so it never sits in
 * the scheduler's stored arguments.
 */
export const sendEmail = internalAction({
  args: { candidateId: v.id("candidates"), tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(
      internal.invites.queries.emailDetails,
      args,
    );
    if (details === null) return null;
    if (!env.SITE_URL) {
      throw new Error("SITE_URL is not set, so the invite has no link.");
    }
    const token = await inviteTokenFor(args.candidateId, details.nonce);
    const link = `${env.SITE_URL.replace(/\/$/, "")}/${invitePath(token)}`;
    await deliver(ctx, {
      from: inviteFrom(details.matchmakerName),
      to: details.to,
      kind: "invite",
      message: inviteEmail({
        matchmakerName: details.matchmakerName,
        link,
        expiresAt: details.expiresAt,
      }),
    });
    return null;
  },
});
