import { Redirect } from "expo-router";
import { useSession } from "../auth/session";

export default function Index() {
  const { state } = useSession();
  return <Redirect href={state.phase === "signedIn" ? "/home" : "/sign-in"} />;
}
