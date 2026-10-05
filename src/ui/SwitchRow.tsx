// A setting that's on or off: the whole row is the control (one stop for a screen reader,
// "switch, on", and a big target), with the platform switch drawn at the end.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { color, space, TOUCH } from "./theme";

export function SwitchRow({ label, value, onValueChange, disabled, children, style }: {
  /** What a screen reader says, beginning with the visible words. */
  label: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  /** What the row shows beside the switch. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.row, disabled && styles.off, style]}
    >
      <View style={styles.content}>{children}</View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} onValueChange={onValueChange} disabled={disabled}
          trackColor={{ true: color.screenDeep, false: color.slate }} thumbColor={value ? color.screen : color.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", gap: space.m },
  content: { flex: 1, minWidth: 0 },
  off: { opacity: 0.5 },
});
