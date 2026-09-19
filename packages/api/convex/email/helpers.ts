import { internal } from "../_generated/api";
import { type ActionCtx, env } from "../_generated/server";
import { type EmailMessage, SIGN_IN_FROM, signInCodeEmail } from "./rules";

export type OutgoingEmail = {
  from: string;
  to: string;
  kind: "sign_in_code" | "invite";
  message: EmailMessage;
};

/**
 * Sends one email. With `RESEND_API_KEY` set it goes out through Resend;
 * without it (local development, the e2e backend) it is written to the
 * internal `emailOutbox` table instead, so every flow still works offline.
 *
 * Runs in an action: email is only ever sent from one, scheduled by the
 * mutation that decided to send it.
 */
export async function sendEmail(
  ctx: ActionCtx,
  email: OutgoingEmail,
): Promise<void> {
  if (env.RESEND_API_KEY === undefined) {
    await ctx.runMutation(internal.email.mutations.recordOutbox, {
      to: email.to,
      kind: email.kind,
      subject: email.message.subject,
      text: email.message.text,
    });
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.message.subject,
      text: email.message.text,
      html: email.message.html,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not send the ${email.kind} email (Resend ${response.status}).`,
    );
  }
}

/**
 * Sends a sign-in code. Called from Convex Auth's `sendVerificationRequest`,
 * which runs in an action. Without Resend the code is also logged.
 */
export async function sendSignInCode(
  ctx: ActionCtx,
  to: string,
  code: string,
): Promise<void> {
  await sendEmail(ctx, {
    from: SIGN_IN_FROM,
    to,
    kind: "sign_in_code",
    message: signInCodeEmail(code),
  });
  if (env.RESEND_API_KEY === undefined) {
    console.log(`RESEND_API_KEY unset — sign-in code for ${to}: ${code}`);
  }
}
