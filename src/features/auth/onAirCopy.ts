// The sign-in set's words, the website's (web/src/pages/Landing.tsx): how to get in, and
// what a sign-in that didn't finish says, as the screen's lower third.
import { SignInError, type LoginReason } from "../../auth/session";

export const LOGIN_MESSAGES: Record<LoginReason, string> = {
  failed: "Signing in didn’t work just now. Try again in a moment.",
  expired: "That sign-in took too long, so it expired. Try again.",
  cancelled: "Sign-in was cancelled. Nothing was changed.",
  busy: "Lots of sign-ins just now. Wait a few minutes and try again.",
  unavailable: "Signing in with Discord isn’t set up yet. Try signing in with Plex.",
};

export const STEPS = [
  { title: "Be in the Discord", body: "Plexbie lives in the household’s private Discord server." },
  { title: "Ask to join", body: "Sign in with Discord and ask to join. An admin reviews it. Not on Discord? Ask an admin for an invite link." },
  { title: "Accept the invite", body: "Once you’re approved, accept the invitation you’re sent, then come back here and sign in." },
] as const;

export interface Notice {
  /** "alert" for something that went wrong; "status" for what the person did themselves. */
  role: "alert" | "status";
  lead: string;
  text: string;
}

/** What a sign-in that didn't finish says on the screen: the website's words where it has them. */
export function noticeFor(e: unknown): Notice {
  const reason = e instanceof SignInError ? e.reason : undefined;
  // Cancelling is something they did, not something that went wrong.
  if (reason === "cancelled") return { role: "status", lead: "Sign-in cancelled", text: LOGIN_MESSAGES.cancelled };
  const text = reason ? LOGIN_MESSAGES[reason] : e instanceof Error ? e.message : LOGIN_MESSAGES.failed;
  return { role: "alert", lead: "Sign-in problem", text };
}
