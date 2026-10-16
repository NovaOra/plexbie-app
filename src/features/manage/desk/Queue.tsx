// The desk's queue: Needs you (Urgent, Today, Coming up), Waiting on them, or Done, as the
// website's. Each row says what it is, how long it has waited and the gist, with its two
// keys under it: what you'd most likely do, and the next thing. A row opens its detail.
import { StyleSheet, View } from "react-native";
import { Button } from "../../../ui/Button";
import { HoldButton } from "../../../ui/HoldButton";
import { KeyRow } from "../../../ui/KeyRow";
import { Placeholder } from "../../../ui/Placeholder";
import { Poster } from "../../../ui/Poster";
import { PressableScale } from "../../../ui/Pressable";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { color, font, radius, space } from "../../../ui/theme";
import { Initial } from "../bits";
import type { DeskActions } from "./useDeskActions";
import { AREAS, listFor, type Area, type Desk, type Group, type Item, type View as DeskView } from "./manageQueue";

export const GROUP_HEAD: Record<Group, { label: string; rule?: string }> = {
  urgent: { label: "Urgent" }, today: { label: "Today" }, soon: { label: "Coming up", rule: "Soonest deadline first" },
  waiting: { label: "Waiting on them", rule: "They owe you an answer" }, done: { label: "Done · last 2 days", rule: "Newest first" },
};

/** Where a key that opens a full view goes: Manage's section, and for Messages, whose conversation. */
export type OpenFull = (tab: string, who?: string) => void;

export function Queue({ desk, view, onView, filter, onFilter, onOpen, a, me, full }: {
  desk: Desk; view: DeskView; onView: (v: DeskView) => void; filter: Area | null; onFilter: (a: Area | null) => void;
  onOpen: (item: Item) => void; a: DeskActions; me: string | null; full: OpenFull;
}) {
  const { list, filtered } = listFor(desk, view, filter);
  const label = AREAS.find((x) => x.id === filter)?.label;
  const groups: Group[] = view === "needs" ? ["urgent", "today", "soon"] : [view];
  const n = (s: string) => (desk.loading ? "–" : s);
  return (
    <View style={styles.queue}>
      <Segmented accessibilityLabel="Show" value={view} onChange={onView} options={[
        { id: "needs", label: `Needs you · ${n(desk.counts.needs)}`, short: `Needs · ${n(desk.counts.needs)}` },
        { id: "waiting", label: `Waiting · ${n(desk.counts.waiting)}` },
        { id: "done", label: "Done" },
      ]} />
      {filtered ? (
        <View style={styles.filterLine}>
          <Text variant="meta" style={styles.grow} accessibilityLiveRegion="polite">Showing <Text variant="meta" style={styles.ink}>{label}</Text> only</Text>
          <Button kind="quiet" label="Show all" onPress={() => onFilter(null)} haptic="none" />
        </View>
      ) : null}
      {desk.loading ? (
        <View style={styles.rows} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => <Placeholder key={i} height={150} />)}
        </View>
      ) : (
        <>
          {desk.missing.length ? (
            <Text variant="meta" style={styles.missing} accessibilityRole="alert">
              Couldn’t load {desk.missing.join(", ")}, so the queue may be missing some of what needs you. Pull down to try again.
            </Text>
          ) : null}
          {groups.map((g) => {
            const rows = list.filter((i) => i.group === g);
            if (!rows.length) return null;
            return (
              <View key={g} style={styles.group}>
                <Text variant="eyebrow" accessibilityRole="header" style={g === "urgent" ? styles.urgentHead : undefined}>
                  {GROUP_HEAD[g].label} · {rows.length}{GROUP_HEAD[g].rule ? <Text variant="eyebrow" style={styles.rule}>  {GROUP_HEAD[g].rule}</Text> : null}
                </Text>
                {rows.map((item) => <QueueRow key={item.key} item={item} onOpen={() => onOpen(item)}
                  actions={<RowActions item={item} a={a} me={me} open={() => onOpen(item)} full={full} />} />)}
              </View>
            );
          })}
          {!desk.missing.length && !list.length ? (
            <View style={styles.clear}>
              <Text variant="title">All clear</Text>
              <Text variant="meta">{view === "waiting" ? "Nobody owes you an answer." : view === "done" ? "Nothing decided, solved or marked done in the last two days."
                : filtered ? `Nothing in ${label} needs you.` : "Nothing needs you right now."}</Text>
            </View>
          ) : null}
          {view === "needs" && list.length ? (
            <Text variant="meta" style={styles.end}>
              {filtered ? `That’s all for ${label}. ${desk.needs.length - list.length} more in the full queue.` : "That’s all."}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** A row's picture: its poster (or a drawn cover), the person's initial, or a letter tile. */
export function ItemArt({ item, big = false }: { item: Item; big?: boolean }) {
  if (item.art) return <Poster poster={item.art.poster} title={item.art.title} id={item.key} style={big ? styles.artBig : styles.art} />;
  return <Initial name={item.initial ?? item.title} />;
}

function QueueRow({ item, onOpen, actions }: { item: Item; onOpen: () => void; actions: React.ReactNode }) {
  const sub = item.sub ? (item.subIsSeason ? ` · ${item.sub}` : "") : "";
  return (
    <View style={[styles.row, item.group === "urgent" && styles.rowUrgent]}>
      <PressableScale onPress={onOpen} haptic="none" style={styles.main} accessibilityHint="Opens it"
        accessibilityLabel={`${item.eyebrow}${item.age ? `, ${item.age}` : ""}. ${item.title}${item.sub ? `, ${item.sub}` : ""}. ${item.meta}`}>
        <ItemArt item={item} />
        <View style={styles.text}>
          <View style={styles.kind}>
            <Text variant="eyebrow" numberOfLines={1} style={[styles.grow, item.group === "urgent" && styles.urgentEyebrow]}>{item.eyebrow}</Text>
            {item.age ? <Text variant="meta" style={styles.age}>{item.age}</Text> : null}
          </View>
          <Text variant="title" numberOfLines={2}>{item.title}{sub ? <Text variant="title" style={styles.season}>{sub}</Text> : null}</Text>
          <Text variant="meta" numberOfLines={2}>{item.sub && !item.subIsSeason ? `${item.sub} · ` : ""}{item.meta}</Text>
        </View>
      </PressableScale>
      <KeyRow>{actions}</KeyRow>
    </View>
  );
}

/** A row's two keys, as the website's: raised for what you'd most likely do, a quiet pill
 *  for the next thing, and a hold for anything you have to mean (Decline, Deny, Cancel). */
function RowActions({ item, a, me, open, full }: { item: Item; a: DeskActions; me: string | null; open: () => void; full: OpenFull }) {
  const busy = a.busy(item.key);
  const key = (label: string, onPress: () => unknown, quiet = false, guarded = true, name?: string) => (
    <Button key={label} kind={quiet ? "quiet" : "secondary"} label={label} busy={guarded && busy} blocked={false}
      onPress={() => void onPress()} accessibilityLabel={name ?? `${label}: ${item.title}`} />
  );
  const openKey = key("Open", open, true, false);
  const hold = (label: string, run: () => unknown) => (
    <HoldButton key={label} kind="quiet" label={label} blocked={busy} onConfirm={() => void run()} accessibilityLabel={`${label} ${item.title}`} />
  );
  const src = item.src;
  switch (src.type) {
    case "ticket": {
      const t = src.t;
      if (item.group === "done") return <>{key("Open", open, false, false)}{key("Reopen", () => a.reopen(t), true)}</>;
      if (item.group === "waiting") return <>{key("Open", open, false, false)}{key("Stop waiting", () => a.reopen(t), true)}</>;
      const video = ["tv", "movie"].includes(t.kind) && (t.subject !== "title" || !!t.tmdb);
      if (src.blocked) return <>{key("Look inside", open, false, false)}{key("Search again", () => a.searchTicket(t), true)}</>;
      if (t.owner && t.owner === me) return <>{video ? key("Search again", () => a.searchTicket(t)) : null}{openKey}</>;
      return <>{key(t.owner ? "Take it over" : "Take it", () => a.take(t))}{openKey}</>;
    }
    case "import": return <>{key("Look inside", open, false, false)}{key("All imports", () => full("health"), true, false)}</>;
    case "stuck": return <>{["tv", "movie"].includes(src.r.title.kind) ? key("Search again", () => a.searchRequest(src.r)) : null}{openKey}</>;
    case "request":
      if (item.group === "done") return <>{key("Open", open, false, false)}{key("All requests", () => full("all"), true, false)}</>;
      return <>{key("Approve", () => a.approve(src.r, true), false, true, `Approve ${item.title} for ${src.r.requester}`)}{hold("Decline", () => a.approve(src.r, false))}</>;
    case "chat":
      if (item.group === "done") return <>{key("Open", open, false, false)}{key("Mark unread", () => a.chatDone(src.p, false), true)}</>;
      return <>{key("Reply", () => full("messages", src.p.id), false, false)}{openKey}</>;
    case "join":
      if (!src.j.messageId) return openKey;
      return <>{key("Invite to Plex", () => a.invite(src.j, true))}{hold("Deny", () => a.invite(src.j, false))}</>;
    case "person": return <>{key("Open", open, false, false)}{key("Never remove", () => a.keepPerson(src.p), true)}</>;
    case "leaving": return <>{key("Keep", () => a.keepTitle(src.c))}{openKey}</>;
    case "link": return <>{key("Open", open, false, false)}{hold("Cancel", () => a.cancelLink(src.i))}</>;
    case "plexinvite":
      if (!src.i.email) return openKey;
      return <>{key("Change email", () => full("invites"), false, false)}{hold("Cancel", () => a.cancelPlex(src.i))}</>;
    case "down": return <>{key("Check again", () => a.checkAgain(src.h))}{openKey}</>;
  }
}

const styles = StyleSheet.create({
  queue: { gap: space.l },
  grow: { flex: 1 },
  ink: { color: color.ink, fontFamily: font.bold },
  filterLine: { flexDirection: "row", alignItems: "center", gap: space.m },
  rows: { gap: space.m },
  missing: { color: color.ink },
  group: { gap: space.m },
  urgentHead: { color: color.tally },
  rule: { color: color.faint, letterSpacing: 0.4 },
  // A card, flat (DESIGN.md: text cards stay flat); an urgent one has a tally rim.
  row: { gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  rowUrgent: { borderWidth: 1, borderColor: "rgba(255, 92, 147, 0.55)" },
  main: { flexDirection: "row", gap: space.m, alignItems: "flex-start" },
  art: { width: 44, borderRadius: radius.s },
  artBig: { width: 96, borderRadius: radius.s },
  text: { flex: 1, gap: 2 },
  kind: { flexDirection: "row", alignItems: "center", gap: space.s },
  urgentEyebrow: { color: color.tally },
  age: { color: color.faint },
  season: { color: color.slateInk, fontFamily: font.medium },
  clear: { gap: space.xs, paddingVertical: space.l },
  end: { textAlign: "center", paddingVertical: space.s },
});
