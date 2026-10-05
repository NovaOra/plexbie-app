// A number with big − and + buttons (48dp each): easy with a thumb, and screen readers
// get it as an adjustable value they can swipe up and down.
import { StyleSheet, View } from "react-native";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";

export function Stepper({ label, value, min, max, step = 1, suffix, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (n: number) => void; disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <View style={styles.box}
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: `${value} ${suffix}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === "increment" ? step : -step)))}>
      <Text variant="label">{label}</Text>
      <View style={styles.row}>
        <PressableScale haptic="light" disabled={disabled || value <= min} onPress={() => onChange(clamp(value - step))} style={styles.btn}
          accessibilityLabel={`${label}: fewer`}>
          <Text style={styles.sign}>−</Text>
        </PressableScale>
        <Text style={styles.value}>{value}</Text>
        <PressableScale haptic="light" disabled={disabled || value >= max} onPress={() => onChange(clamp(value + step))} style={styles.btn}
          accessibilityLabel={`${label}: more`}>
          <Text style={styles.sign}>+</Text>
        </PressableScale>
        <Text variant="meta">{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.s },
  btn: { width: 48, borderRadius: radius.m, backgroundColor: color.panelRaised, alignItems: "center", justifyContent: "center" },
  sign: { fontFamily: font.bold, fontSize: 22, color: color.screen },
  value: { minWidth: 48, textAlign: "center", fontFamily: font.bold, fontSize: 20, color: color.ink },
});
