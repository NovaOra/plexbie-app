// Keys that belong together (Back and Save, Approve and Decline): side by side, sharing the
// width equally when every label fits on one line in its share; side by side in proportion
// to their words when only that fits; otherwise one under another, full width. A label never
// wraps inside a key.
import { Children, cloneElement, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { EM_KEY, EM_PILL, keyWidth } from "./keyFit";
import { space } from "./theme";

type KeyProps = { label?: string; busyLabel?: string; kind?: string; onConfirm?: unknown; style?: StyleProp<ViewStyle> };

export function KeyRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const keys = flat(children);
  const share = (width - GAP * (keys.length - 1)) / keys.length;
  // The longer of its words and its busy words (with the spinner beside them), so a press never flips the layout.
  const widest = ({ props: k }: ReactElement<KeyProps>) => {
    // A hold's words sit 18 in from each side, inside its edge.
    const quiet = k.kind === "quiet";
    const padding = k.onConfirm ? 40 : quiet ? space.l * 2 + 2 : 40;
    const em = quiet ? EM_PILL : EM_KEY;
    // A hold button reads "Hold to decline", not "Decline".
    const words = k.label && k.onConfirm ? `Hold to ${k.label}` : k.label;
    return Math.max(words ? keyWidth(words, fontScale, { padding, em }) : 0, k.busyLabel ? keyWidth(k.busyLabel, fontScale, { padding, em }) + 28 : 0);
  };
  // Until it's measured, side by side (most pairs fit).
  const even = !width || keys.every((k) => widest(k) <= share);
  const sized = !even && keys.reduce((sum, k) => sum + widest(k), GAP * (keys.length - 1)) <= width;
  const look = (k: ReactElement<KeyProps>) => (even ? styles.share : sized ? { flexGrow: 1, flexShrink: 0, flexBasis: widest(k) } : styles.full);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[even || sized ? styles.row : styles.column, style]}>
      {keys.map((k) => cloneElement(k, { style: [k.props.style, look(k)] }))}
    </View>
  );
}

/** The keys themselves, through any fragment a caller grouped them in. */
function flat(children: ReactNode): ReactElement<KeyProps>[] {
  return Children.toArray(children).flatMap((c) => !isValidElement(c) ? []
    : c.type === Fragment ? flat((c.props as { children?: ReactNode }).children) : [c as ReactElement<KeyProps>]);
}

const GAP = space.m;
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: GAP },
  column: { gap: space.s },
  share: { flex: 1 },
  full: { flex: undefined, flexGrow: 0, flexBasis: "auto", alignSelf: "stretch" },
});
