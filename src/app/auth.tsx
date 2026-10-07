import { Redirect, router } from "expo-router";
import { useEffect } from "react";

// plexbie://auth?code=… lands here when the system hands the sign-in redirect to the
// app as a link (Android can). The sign-in itself is finished by the waiting
// openAuthSessionAsync in auth/session.tsx; this route only gets out of the way: back to
// the screen that started the sign-in (the invite screen shows its answer there), or to
// the start when there is nothing underneath.
export default function AuthReturn() {
  const under = router.canGoBack();
  useEffect(() => { if (under) router.back(); }, [under]);
  return under ? null : <Redirect href="/" />;
}
