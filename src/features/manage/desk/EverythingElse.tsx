// "Everything else": every full view, grouped by job like the monitors, with the same
// counts (the website's manageMenu.ts): a group's head says what its rows count, and each
// row's line starts with its own share of it. A row opens its full view.
import { StyleSheet, View } from "react-native";
import { PressableScale } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../../ui/theme";
import type { MenuGroup, MenuRow } from "./manageMenu";

/** What a row shows beside its name, in one style everywhere: its count in a round badge, and a
 *  tally dot when any of it can't wait (urgent, down, or a watch party on now). */
function badge(r: MenuRow) {
  const count = r.count ?? 0;
  const live = r.tally === "live";
  const hot = !!r.urgent || !!r.hot || r.tally === "down";
  if (!count && !hot && !live) return null;
  return { count, dot: hot || live, said: [count ? String(count) : "", live ? "live now" : hot ? "urgent" : ""].filter(Boolean).join(", ") };
}

export function EverythingElse({ groups, onPick }: { groups: MenuGroup[]; onPick: (row: MenuRow) => void }) {
  return (
    <View style={styles.list}>
      {groups.map((g) => (
        <View key={g.id} style={styles.group}>
          <Text variant="eyebrow" accessibilityRole="header">
            {/* What makes up the count says the count ("2 waiting"); a group without one gives its number. */}
            {g.label}{g.makeup ? <Text variant="eyebrow" style={styles.makeup}>{` · ${g.makeup}`}</Text> : typeof g.count === "number" ? ` · ${g.count}` : ""}
          </Text>
          {g.rows.map((r) => {
            const b = badge(r);
            return (
              <PressableScale key={r.id} haptic="none" onPress={() => onPick(r)} style={styles.row}
                accessibilityLabel={`${r.label}${b ? `, ${b.said}` : ""}. ${r.desc}`}>
                <View style={styles.text}>
                  <Text variant="label" style={styles.ink} numberOfLines={1}>{r.label}</Text>
                  <Text variant="meta" numberOfLines={2}>{r.desc}</Text>
                </View>
                {b ? (
                  <View style={styles.badge} testID={`menu-badge-${r.id}`}>
                    {b.dot ? <View testID={`menu-dot-${r.id}`} style={styles.dot} /> : null}
                    {b.count ? <View style={styles.count}><Text style={styles.countText}>{b.count}</Text></View> : null}
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xl },
  group: { gap: space.xs },
  makeup: { color: color.faint, letterSpacing: 0.4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: TOUCH, paddingVertical: space.s, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: color.panelRaised },
  text: { flex: 1, gap: 2 },
  ink: { color: color.ink },
  badge: { flexDirection: "row", alignItems: "center", gap: space.s },
  // The tally: an 8px dot, as on the sign-in set and the monitors' lamps.
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.tally },
  count: { minWidth: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.field },
  countText: { fontFamily: font.bold, fontSize: 13, lineHeight: 16, color: color.ink, fontVariant: ["tabular-nums"] },
});
