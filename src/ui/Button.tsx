// The app's buttons, as the website's: keys and pills. A key has a lip under its face and
// a line of light along the top; pressed, the face goes down 2px onto a 1px lip, and under
// way (`busy`) it stays down with a spinner.
// - primary: the screen's one pink key, for its main action.
// - secondary: a raised slate key, for everything else that acts.
// - quiet: a hollow pill, like a toggle that isn't on (back, try again, show more, not now).
//   Never the main action.
// - danger: a raised key; what makes it dangerous is the confirm behind it, not its colour
//   (tally is for what's live).
// `blocked`: another action on the same thing is running, so it waits, flat and slate.
// All are PressableScale (haptic, 48dp to hit).
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, depth, EASE_OUT_CSS, radius, space, type } from "./theme";

export type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

export function Button({ label, onPress, kind = "primary", busy, busyLabel, blocked, disabled, style, accessibilityLabel, haptic }: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  /** Working on it: a spinner beside busyLabel (or the label), the key held down, and no second press. */
  busy?: boolean;
  busyLabel?: string;
  /** Something else on the same thing is running: flat and slate, no spinner, no press. */
  blocked?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  haptic?: "light" | "none";
}) {
  const [down, setDown] = useState(false);
  const quiet = kind === "quiet";
  const pink = kind === "primary";
  // Off (disabled, or waiting on something else) and not its own action: flat, no lip.
  const flat = (disabled || blocked) && !busy;
  const sunk = !flat && (down || !!busy);
  const look = flat ? (quiet ? styles.quietOff : styles.keyOff)
    : quiet ? (sunk ? styles.quietDown : styles.quiet)
    : pink ? (sunk ? styles.primaryDown : styles.primary) : styles.secondary;
  const tint = flat ? (quiet ? color.faint : color.slateInk) : pink ? color.onScreen : color.ink;
  const lip = flat ? 0 : quiet ? (sunk ? depth.lipDown : depth.quietLip) : sunk ? depth.lipDown : depth.lip;
  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled || busy || blocked}
      feel="key"
      sunk={!!busy}
      haptic={haptic}
      accessibilityLabel={busy && busyLabel ? busyLabel : accessibilityLabel ?? label}
      accessibilityState={{ busy: !!busy }}
      style={[styles.base, quiet ? styles.pill : styles.key, look, style]}
    >
      {lip ? (
        <Animated.View testID="key-lip" pointerEvents="none" style={[styles.lip, {
          height: lip, backgroundColor: quiet ? depth.quietLipColor : pink ? color.screenDeep : depth.keyLip,
          transitionProperty: "height", transitionDuration: 130, transitionTimingFunction: EASE_OUT_CSS,
        }]} />
      ) : null}
      {!flat && !quiet ? <View pointerEvents="none" style={styles.highlight} /> : null}
      {busy ? <ActivityIndicator testID="key-spinner" color={tint} size="small" /> : null}
      <Text variant="label" style={[quiet ? type.quiet : type.button, styles.label, { color: tint }]}>{busy && busyLabel ? busyLabel : label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", gap: space.s, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: 1 },
  key: { minHeight: 48, paddingHorizontal: 20, borderRadius: radius.s },
  pill: { minHeight: 44, paddingHorizontal: space.l, borderRadius: radius.pill, borderWidth: 1 },
  primary: { backgroundColor: color.screen },
  primaryDown: { backgroundColor: color.screenDeep },
  secondary: { backgroundColor: color.panelRaised },
  keyOff: { backgroundColor: color.panelRaised },
  quiet: { backgroundColor: "transparent", borderColor: color.slate },
  // Pressed, a quiet pill fills faintly with slate, as the website's does under a pointer.
  quietDown: { backgroundColor: "rgba(104, 121, 166, 0.12)", borderColor: color.slateInk },
  quietOff: { backgroundColor: "transparent", borderColor: color.rule },
  lip: { position: "absolute", left: 0, right: 0, bottom: 0 },
  highlight: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: depth.highlight },
  label: { textAlign: "center" },
});
