// A load that failed, as the website's OffAir (web/src/components/ui.tsx): a closed strap
// whose tab says which part of the page couldn't load ("No signal" for the whole thing),
// the words beside it (never "nothing here", which would be a false answer), and a quiet
// Try again pill. A screen reader hears it at once.
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { color, radius, space } from "./theme";

export function OffAir({ tab = "No signal", children = "Couldn’t reach Plexbie just now. Nothing is lost.", onRetry, retrying, style }: {
  /** Which part couldn't load ("Channel"), or "No signal" for an outage. */
  tab?: string;
  children?: string;
  onRetry?: () => void;
  /** Trying again now: the pill stays down with a spinner. */
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.box, style]}>
      <View style={styles.strap} accessible accessibilityRole="alert" accessibilityLabel={`${tab}. ${children}`}>
        <View style={styles.tab}>
          <View style={styles.dot} />
          <Text variant="eyebrow" numberOfLines={1} style={styles.tabText}>{tab}</Text>
        </View>
        <Text variant="meta" style={styles.bar}>{children}</Text>
      </View>
      {onRetry ? (
        <Button kind="quiet" label="Try again" busy={retrying} busyLabel="Trying again…" onPress={onRetry} haptic="none" style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.m, alignItems: "flex-start" },
  strap: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "stretch", borderRadius: radius.s, overflow: "hidden",
    borderWidth: 1, borderColor: color.rule, backgroundColor: color.panel,
  },
  // The tab: the strap's label, slate while off air (tally is for what's live).
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.m, backgroundColor: color.panelRaised },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.slate },
  tabText: { color: color.slateInk },
  bar: { flex: 1, color: color.ink, paddingHorizontal: space.m, paddingVertical: space.s + 2 },
  retry: { alignSelf: "flex-start" },
});
