import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useSession } from "../auth/session";

export default function Index() {
  const { state } = useSession();
  const signedIn = state.phase === "signedIn";
  // Signed in, Home already sits beneath this screen (the root layout's anchor): go back down
  // to it, where a redirect would stack a second Home over it.
  useFocusEffect(useCallback(() => { if (signedIn) router.dismissTo("/home"); }, [signedIn]));
  return signedIn ? null : <Redirect href="/sign-in" />;
}
