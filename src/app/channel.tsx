import { Redirect } from "expo-router";

// The channel lives on Home now (who's watching, the board, your figures); older links land there.
export default function Channel() {
  return <Redirect href="/home" />;
}
