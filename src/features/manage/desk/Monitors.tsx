// The desk's monitors: one slate housing holding five small lit screens, one per part of
// the job (requests, help, people, library, services). Each shows how many things need you
// there, with a lamp that turns tally pink when one can't wait. Pressing one shows only
// its part of the queue (pressed again, everything); it sinks like a key and its screen
// gets a pink edge while it's chosen. Android has no glass: the housing is solid, lit from above.
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { PressableScale } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { color, font, radius, space, tint } from "../../../ui/theme";
import type { Area, Monitor } from "./manageQueue";

/** The monitors' names where five share a phone's width (the website's short names). */
export const MONITOR_SHORT: Record<Area, string> = { requests: "Asks", help: "Help", people: "People", library: "Library", services: "Health" };

/** What a screen reader hears for one: its name, its count and what makes it up, and the first thing in it. */
export function monitorLabel(m: Monitor) {
  const short = MONITOR_SHORT[m.area];
  const name = short.toLowerCase() === m.label.toLowerCase() ? m.label : `${m.label} (${short})`;
  const said = m.failed ? "couldn’t load" : m.known ? `${m.count}, ${m.makeup}` : "loading";
  return `${name}: ${said}${m.hot ? ", urgent" : ""}${m.first ? `. First: ${m.first.title}, ${m.first.top}` : ""}`;
}

export function Monitors({ monitors, filter, onToggle }: { monitors: Monitor[]; filter: Area | null; onToggle: (area: Area) => void }) {
  return (
    <View style={styles.housing} accessibilityLabel="At a glance. Press a monitor to show only that part of the queue">
      <LinearGradient colors={[CAB_TOP, color.slate, CAB_BOT]} style={StyleSheet.absoluteFill} />
      <View style={styles.bevel} pointerEvents="none" />
      {monitors.map((m) => {
        const on = filter === m.area;
        const hot = m.hot && m.known;
        return (
          <PressableScale key={m.area} feel="key" sunk={on} haptic="none" onPress={() => onToggle(m.area)} style={styles.monitor}
            accessibilityLabel={monitorLabel(m)} accessibilityState={{ selected: on }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.label}>{MONITOR_SHORT[m.area]}</Text>
            <View style={[styles.screen, on && styles.screenOn]}>
              <LinearGradient colors={[color.fieldDeep, GLOW, color.fieldDeep]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
              {/* The power lamp in the screen's corner: tally pink when something can't wait. */}
              <View style={[styles.lamp, hot && styles.lampHot]} />
              <Text style={[styles.count, hot && styles.countHot]}>{m.failed ? "?" : m.known ? m.count : "–"}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// The cabinet lit from above and shaded below (DESIGN.md: slate lightened ~18%, darkened ~30%).
const CAB_TOP = "#8594b8";
const CAB_BOT = "#4a5574";
// A lit screen's centre: panel with a little of the screen's pink in it.
const GLOW = "#3a3a55";
const styles = StyleSheet.create({
  housing: {
    flexDirection: "row", gap: space.s, padding: space.s, borderRadius: radius.l, overflow: "hidden",
    // An object: one soft shadow under it.
    elevation: 10, shadowColor: "#030612", shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 12 },
    backgroundColor: color.slate,
  },
  bevel: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.l, borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(174, 184, 216, 0.45)" },
  monitor: { flex: 1, gap: space.xs, minHeight: 0 },
  lamp: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: color.slate },
  lampHot: { backgroundColor: color.tally },
  label: { textAlign: "center", fontFamily: font.bold, fontSize: 11, lineHeight: 14, letterSpacing: 11 * 0.03, textTransform: "uppercase", color: color.onScreen },
  screen: {
    height: 56, borderRadius: radius.s, overflow: "hidden", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: tint(color.screen, 0.14),
  },
  screenOn: { borderWidth: 1.5, borderColor: color.screen },
  count: { fontFamily: font.black, fontSize: 26, lineHeight: 30, color: color.ink, fontVariant: ["tabular-nums"] },
  countHot: { color: color.tally },
});
