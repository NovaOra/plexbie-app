// "Everything else": every full view, grouped by job like the monitors, with the same
// counts (the website's manageMenu.ts). A row opens its full view.
import { StyleSheet, View } from "react-native";
import { PressableScale } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../../ui/theme";
import type { MenuGroup, MenuRow } from "./manageMenu";

/** What a row says beside its name: a count, "2 urgent", "Urgent", or a tally for what's down or live. */
function badge(r: MenuRow) {
  if (r.tally === "down") return { text: `${r.count ?? 1} down`, tally: true };
  if (r.tally === "live") return { text: "Live", tally: true };
  if (r.count) return { text: r.urgent ? `${r.count} · ${r.urgent} urgent` : String(r.count), tally: false };
  if (r.hot) return { text: "Urgent", tally: false, hot: true };
  return null;
}

export function EverythingElse({ groups, onPick }: { groups: MenuGroup[]; onPick: (row: MenuRow) => void }) {
  return (
    <View style={styles.list}>
      {groups.map((g) => (
        <View key={g.id} style={styles.group}>
          <Text variant="eyebrow" accessibilityRole="header">
            {g.label}{typeof g.count === "number" ? ` · ${g.count}` : ""}{g.makeup && g.count !== 0 ? <Text variant="eyebrow" style={styles.makeup}>{`  ${g.makeup}`}</Text> : null}
          </Text>
          {g.rows.map((r) => {
            const b = badge(r);
            return (
              <PressableScale key={r.id} haptic="none" onPress={() => onPick(r)} style={styles.row}
                accessibilityLabel={`${r.label}${b ? `, ${b.text}` : ""}. ${r.desc}`}>
                <View style={styles.text}>
                  <Text variant="label" style={styles.ink} numberOfLines={1}>{r.label}</Text>
                  <Text variant="meta" numberOfLines={2}>{r.desc}</Text>
                </View>
                {b ? <Text style={[styles.badge, b.tally && styles.tally, b.hot && styles.hot]}>{b.text}</Text> : null}
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
  badge: { fontFamily: font.bold, fontSize: 13, lineHeight: 16, color: color.ink, paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: color.rule, overflow: "hidden" },
  tally: { backgroundColor: color.tally, color: color.onTally },
  hot: { color: color.tally, backgroundColor: "transparent" },
});
