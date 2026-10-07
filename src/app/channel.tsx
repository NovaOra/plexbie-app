import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";

// The channel lives on Home now (who's watching, the board, your figures); older links land there,
// on the Home already beneath this screen when there is one (the root layout's anchor).
export default function Channel() {
  useFocusEffect(useCallback(() => { router.dismissTo("/home"); }, []));
  return null;
}
