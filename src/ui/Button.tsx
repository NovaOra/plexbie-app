// The two buttons the app uses: a filled pink one for the main action, an outlined one
// for everything else. Both are PressableScale (press feedback, haptic, 48dp).
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, radius, space } from "./theme";

export function Button({ label, onPress, kind = "primary", busy, busyLabel, disabled, style, accessibilityLabel, haptic }: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  /** Working on it: a spinner beside busyLabel (or the label), and no second press. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  haptic?: "light" | "none";
}) {
  const filled = kind === "primary";
  const tint = filled ? color.onScreen : kind === "danger" ? color.tally : color.screen;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      haptic={haptic}
      accessibilityLabel={busy && busyLabel ? busyLabel : accessibilityLabel ?? label}
      accessibilityState={{ busy: !!busy }}
      style={[styles.base, filled ? styles.primary : kind === "danger" ? styles.danger : styles.secondary, style]}
    >
      {busy ? <ActivityIndicator color={tint} size="small" /> : null}
      <Text variant="label" style={{ color: tint }}>{busy && busyLabel ? busyLabel : label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row", gap: space.s, alignItems: "center", justifyContent: "center",
    paddingHorizontal: space.xl, borderRadius: radius.pill,
  },
  primary: { backgroundColor: color.screen },
  secondary: { borderWidth: 1.5, borderColor: color.screen },
  danger: { borderWidth: 1.5, borderColor: color.tally },
});
