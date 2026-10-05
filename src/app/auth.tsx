import { Redirect } from "expo-router";

// plexbie://auth?code=… lands here when the system hands the sign-in redirect to the
// app as a link (Android can). The sign-in itself is finished by the waiting
// openAuthSessionAsync in auth/session.tsx; this route only gets out of the way.
export default function AuthReturn() {
  return <Redirect href="/" />;
}
