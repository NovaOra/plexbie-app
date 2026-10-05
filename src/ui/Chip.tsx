// A choice: one of a few options (film or TV, a season, a format, a reason). Selected
// reads as filled pink, and screen readers hear "selected".
import { StyleSheet, useWindowDimensions } from "react-native";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, radius, space } from "./theme";

export function Chip({ label, selected, onPress, disabled, accessibilityLabel, role = "radio" }: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  /** radio: one of a few; tab: a section switcher; checkbox: on or off on its own; button: an action. */
  role?: "radio" | "tab" | "checkbox" | "button";
}) {
  const large = useWindowDimensions().fontScale >= 1.3;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="none"
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === "checkbox" || role === "radio" ? { checked: selected } : role === "tab" ? { selected } : {}}
      style={[styles.chip, selected && styles.on]}
    >
      <Text variant="label" style={[styles.text, selected && styles.textOn]} numberOfLines={large ? undefined : 1}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    justifyContent: "center", paddingHorizontal: space.l, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.panel,
  },
  on: { backgroundColor: color.screen, borderColor: color.screen },
  text: { color: color.ink, fontSize: 15 },
  textOn: { color: color.onScreen },
});
