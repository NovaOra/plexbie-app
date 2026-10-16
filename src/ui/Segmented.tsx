// A segmented control, as the website's: one track holding two or three options side by
// side. The chosen one is a raised face with a 2px line along its foot (screen pink, or
// amber for something only admins see), never a pink fill; the others are hollow. Labels
// stay on one line: when the track is too narrow for them, each option uses its `short` label.
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { keyWidth } from "./keyFit";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, depth, radius, space, type } from "./theme";

export type Segment<T extends string> = { id: T; label: string; short?: string; accessibilityLabel?: string };

export function Segmented<T extends string>({ options, value, onChange, accent = color.screen, accessibilityLabel }: {
  options: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  /** The chosen option's line: screen pink, or color.note for an admins-only choice. */
  accent?: string;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const share = (width - PAD * 2 - GAP * (options.length - 1)) / options.length;
  const short = width > 0 && options.some((o) => keyWidth(o.label, fontScale, { padding: space.m * 2 }) > share);
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <PressableScale key={o.id} haptic="none" onPress={() => onChange(o.id)} accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label} accessibilityState={{ checked: on }}
            style={[styles.item, on && styles.on]}>
            {on ? <View pointerEvents="none" style={[styles.line, { backgroundColor: accent }]} /> : null}
            {on ? <View pointerEvents="none" style={styles.highlight} /> : null}
            <Text numberOfLines={1} style={[type.quiet, styles.label, on && styles.labelOn]}>{short ? o.short ?? o.label : o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const PAD = space.xs;
const GAP = space.xs;
const styles = StyleSheet.create({
  track: { flexDirection: "row", gap: GAP, padding: PAD, borderRadius: radius.pill, backgroundColor: color.fieldDeep, borderWidth: 1, borderColor: color.slate },
  item: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: space.m, overflow: "hidden" },
  on: { backgroundColor: color.panelRaised },
  line: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  highlight: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: depth.highlight },
  label: { color: color.slateInk, textAlign: "center" },
  labelOn: { color: color.ink },
});
