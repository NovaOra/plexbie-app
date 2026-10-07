// A reply or note that's been typed and not sent isn't lost to a stray Back: while there's
// one, leaving the screen asks first. That covers Android's Back, the back button, and on
// iOS the edge swipe and a sheet's swipe-down, which the native stack holds back while
// there's a draft. Android swipes a sheet away before the app hears of it, so that one
// can't be stopped and goes through (the help sheet keeps its note for next time).
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { useConfirm } from "./Confirm";

/** While `dirty`, leaving asks "Discard your message?"; Discard runs `onDiscard`, then leaves.
 *  Returns `sent()`, called just before a screen closes itself once the draft has gone. */
export function useDraftGuard(dirty: boolean, onDiscard?: () => void) {
  const confirm = useConfirm();
  const navigation = useNavigation();
  const sent = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    // Android's native stack only says POP once the screen is already gone.
    if (sent.current || (Platform.OS === "android" && data.action.type === "POP")) { leave(); return; }
    confirm("Discard your message?", "It hasn’t been sent.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { onDiscard?.(); leave(); } },
    ]);
  });
  return useCallback(() => { sent.current = true; }, []);
}
