// Keys that belong together (Back and Save, Approve and Decline): side by side, sharing the
// width equally when every label fits on one line in its share; otherwise one under another,
// full width and the same height (a key and a pill alike). Never a wide key over a short pill,
// and a label never wraps inside a key.
import { Children, cloneElement, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { EM_KEY, EM_PILL, keyWidth } from "./keyFit";
import { Text } from "./Text";
import { space, type } from "./theme";

type KeyProps = { label?: string; busyLabel?: string; kind?: string; onConfirm?: unknown; style?: StyleProp<ViewStyle> };

/** Every set of words a key can show, with whether it's busy (a spinner beside it). A hold is
 *  sized by its resting words ("Hold to decline"): it fits what it says once armed into that. */
function wordsOf(k: KeyProps): { text: string; spinner: boolean }[] {
  if (!k.label) return [];
  if (k.onConfirm) return [{ text: `Hold to ${k.label.toLowerCase()}`, spinner: false }];
  return [{ text: k.label, spinner: false }, ...(k.busyLabel ? [{ text: k.busyLabel, spinner: true }] : [])];
}

export function KeyRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  // Each label's own width, as the phone lays it out (the estimate stands in until then).
  const [natural, setNatural] = useState<Record<string, number>>({});
  const { fontScale } = useWindowDimensions();
  const keys = flat(children);
  const share = (width - GAP * (keys.length - 1)) / keys.length;
  const quietOf = (k: KeyProps) => k.kind === "quiet";
  // The widest of its words (with the spinner beside busy ones), so a press or an arm never flips the layout.
  const widest = ({ props: k }: ReactElement<KeyProps>) => {
    // Keys and holds have 20 (holds 18 and an edge) each side; pills 16 and an edge.
    const padding = k.onConfirm || !quietOf(k) ? 40 : space.l * 2 + 2;
    const em = quietOf(k) ? EM_PILL : EM_KEY;
    return Math.max(0, ...wordsOf(k).map((w) =>
      (natural[`${quietOf(k) ? "q" : "k"}:${w.text}`] ?? keyWidth(w.text, fontScale, { padding: 0, em })) + padding + SAFE + (w.spinner ? 28 : 0)));
  };
  const texts = [...new Map(keys.flatMap(({ props: k }) => wordsOf(k).map((w) => {
    const id = `${quietOf(k) ? "q" : "k"}:${w.text}`;
    return [id, { id, text: w.text, quiet: quietOf(k) }] as const;
  }))).values()];
  // Side by side until the row and every label in it are measured (most pairs fit): a row
  // only stacks on the phone's own widths, never on the estimate.
  const measured = !!width && texts.every((t) => natural[t.id] !== undefined);
  const even = !measured || keys.every((k) => widest(k) <= share);
  const look = even ? styles.share : styles.full;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[even ? styles.row : styles.column, style]}>
      {keys.map((k) => cloneElement(k, { style: [k.props.style, look] }))}
      {/* The labels laid out unconstrained, off screen, to know their real widths. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {texts.map((t) => (
          <Text key={t.id} variant="label" style={t.quiet ? type.quiet : type.button}
            onLayout={(e) => { const w = Math.ceil(e.nativeEvent.layout.width); setNatural((n) => (n[t.id] === w ? n : { ...n, [t.id]: w })); }}>{t.text}</Text>
        ))}
      </View>
    </View>
  );
}

/** A little over the label's own width, so a line that only just fits is never cut. */
const SAFE = 6;

/** The keys themselves, through any fragment a caller grouped them in. */
function flat(children: ReactNode): ReactElement<KeyProps>[] {
  return Children.toArray(children).flatMap((c) => !isValidElement(c) ? []
    : c.type === Fragment ? flat((c.props as { children?: ReactNode }).children) : [c as ReactElement<KeyProps>]);
}

const GAP = space.m;
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: GAP },
  measure: { position: "absolute", left: -10000, top: 0, width: 4000, alignItems: "flex-start", opacity: 0 },
  column: { gap: space.s },
  share: { flex: 1 },
  full: { flex: undefined, flexGrow: 0, flexBasis: "auto", alignSelf: "stretch" },
});
