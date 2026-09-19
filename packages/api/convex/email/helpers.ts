import { internal } from "../_generated/api";
import { type ActionCtx, env } from "../_generated/server";
import { SIGN_IN_FROM, signInCodeEmail } from "./rules";

/**
 * Sends a sign-in code. With `RESEND_API_KEY` set it goes out through Resend;
 * without it (local development, the e2e backend) it is written to the
 * internal `emailOutbox` table and logged, so sign-in still works offline.
 *
 * Called from Convex Auth's `sendVerificationRequest`, which runs in an action.
 */
export async function sendSignInCode(
  ctx: ActionCtx,
  to: string,
  code: string,
): Promise<void> {
  const message = signInCodeEmail(code);

  if (env.RESEND_API_KEY === undefined) {
    await ctx.runMutation(internal.email.mutations.recordOutbox, {
      to,
      kind: "sign_in_code",
      subject: message.subject,
      text: message.text,
    });
    console.log(`RESEND_API_KEY unset — sign-in code for ${to}: ${code}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SIGN_IN_FROM,
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not send the sign-in email (Resend ${response.status}).`,
    );
  }
}
