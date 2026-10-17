// The desk itself, under Manage's title: what needs you in a line, the monitors, then the
// queue, with the selected item's detail beside it on a wide screen.
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "../../../ui/Text";
import { color, font, space } from "../../../ui/theme";
import { DetailPane } from "./Detail";
import { Monitors } from "./Monitors";
import { Queue, type OpenFull } from "./Queue";
import { listFor, type Area, type Desk, type Item, type View as Shown } from "./manageQueue";
import type { DeskActions } from "./useDeskActions";

/** Wide enough for the queue and its detail side by side (a tablet, or a phone on its side). */
export const WIDE = 900;

export function DeskView({ desk, a, me, full, view, onView, filter, onFilter, selected, onOpen }: {
  desk: Desk; a: DeskActions; me: string | null; full: OpenFull;
  view: Shown; onView: (v: Shown) => void; filter: Area | null; onFilter: (a: Area | null) => void;
  selected: string | null; onOpen: (item: Item) => void;
}) {
  const wide = useWindowDimensions().width >= WIDE;
  const n = desk.needs.length;
  const headline = desk.loading ? "Checking what needs you…"
    : `${desk.missing.length ? "At least " : ""}${!n && !desk.missing.length ? "Nothing needs you right now." : n === 1 ? "1 thing needs you." : `${n} things need you.`}`
      + (desk.urgent ? ` ${desk.urgent} ${desk.urgent === 1 ? "is" : "are"} urgent.` : "");
  const { list } = listFor(desk, view, filter);
  const current = wide ? list.find((i) => i.key === selected) ?? list[0] ?? null : null;
  const queue = <Queue desk={desk} view={view} onView={onView} filter={filter} onFilter={onFilter} onOpen={onOpen} a={a} me={me} full={full} />;
  return (
    <View style={styles.desk}>
      <Text variant="body" accessibilityLiveRegion="polite">
        <Text variant="body" style={styles.ink}>{headline}</Text> Everything else is in the menu, top right.
      </Text>
      <Monitors monitors={desk.monitors} filter={view === "needs" ? filter : null} onToggle={(area) => { onView("needs"); onFilter(filter === area ? null : area); }} />
      {desk.facts.party ? <Text variant="meta">Watch party: <Text variant="meta" style={styles.ink}>{desk.facts.party}</Text></Text> : null}
      {wide ? (
        <View style={styles.panes}>
          <View style={styles.col}>{queue}</View>
          <View style={styles.col}>{current ? <DetailPane key={current.key} item={current} a={a} full={full} /> : null}</View>
        </View>
      ) : queue}
    </View>
  );
}

const styles = StyleSheet.create({
  desk: { gap: space.l },
  ink: { color: color.ink, fontFamily: font.bold },
  panes: { flexDirection: "row", gap: space.l, alignItems: "flex-start" },
  col: { flex: 1 },
});
