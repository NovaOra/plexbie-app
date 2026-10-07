import { useState } from "react";
import { useSession } from "../auth/session";
import { SignInScreen } from "../features/auth/SignInScreen";

// The screen opens with the session's address and notice. A saved sign-in read again on return
// to the app (auth/session.tsx) can change them while it's up: then it opens afresh with the new
// ones. Kept as they were while it leaves after a sign-in.
export default function SignIn() {
  const { state } = useSession();
  const [opened, setOpened] = useState("");
  const now = state.phase === "signedOut" ? `${state.server}\n${state.notice ?? ""}` : opened;
  if (now !== opened) setOpened(now);
  return <SignInScreen key={now} />;
}
