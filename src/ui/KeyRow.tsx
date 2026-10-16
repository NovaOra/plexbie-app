// Keys that belong together (Back and Save, Approve and Decline): side by side, sharing the
// width, when every label fits on one line in its share; otherwise one under another, full
// width. A label never wraps inside a key.
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { keyWidth } from "./keyFit";
import { space } from "./theme";

type KeyProps = { label?: string; busyLabel?: string; kind?: string; onConfirm?: unknown; style?: StyleProp<ViewStyle> };

export function KeyRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const keys = Children.toArray(children).filter(isValidElement) as ReactElement<KeyProps>[];
  const share = (width - GAP * (keys.length - 1)) / keys.length;
  // The longer of its words and its busy words (with the spinner beside them), so a press never flips the layout.
  const widest = ({ props: k }: ReactElement<KeyProps>) => {
    const padding = k.kind === "quiet" ? space.l * 2 : 40;
    // A hold button reads "Hold to decline", not "Decline".
    const words = k.label && k.onConfirm ? `Hold to ${k.label}` : k.label;
    return Math.max(words ? keyWidth(words, fontScale, { padding }) : 0, k.busyLabel ? keyWidth(k.busyLabel, fontScale, { padding }) + 28 : 0);
  };
  // Until it's measured, side by side (most pairs fit).
  const side = !width || keys.every((k) => widest(k) <= share);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[side ? styles.row : styles.column, style]}>
      {keys.map((k) => cloneElement(k, { style: [k.props.style, side ? styles.share : styles.full] }))}
    </View>
  );
}

const GAP = space.m;
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: GAP },
  column: { gap: space.s },
  share: { flex: 1 },
  full: { flex: undefined, flexGrow: 0, flexBasis: "auto", alignSelf: "stretch" },
});
