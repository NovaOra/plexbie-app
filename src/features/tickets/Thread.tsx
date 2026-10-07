// A ticket's timeline, as the website draws it: messages in boxes (an admin's note in
// amber, a reply to the member in pink) and what happened to it ("Took it", "Solved") as a
// quiet line between them. Admins see every entry; a member sees theirs and the replies.
import { StyleSheet, View } from "react-native";
import type { AppTicketEntry } from "../../api/schemas";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { since } from "../requests/stage";

const AMBER = "#f2c66d";

/** Where a ticket is, in words, and how loud to show it. */
export function ticketState(t: { status: string; waiting?: boolean; who?: string }) {
  if (t.status !== "open") return { label: "Solved", tone: "done" as const };
  return t.waiting ? { label: `Waiting on ${t.who ?? "them"}`, tone: "wait" as const } : { label: "Needs an admin", tone: "hot" as const };
}

export function TicketPill({ label, tone }: { label: string; tone: "hot" | "wait" | "done" | "plain" }) {
  return <Text style={[styles.pill, pill[tone]]}>{label}</Text>;
}

/** `who` is the member: an admin's reply is tagged "Sent to {who}" when `admin`, or
 *  "Not delivered" when it reached nobody (`missed`). */
export function Thread({ entries, who, admin }: { entries: AppTicketEntry[]; who: string; admin: boolean }) {
  return (
    <View style={styles.list} accessibilityLabel="Timeline">
      {entries.map((e) => e.kind === "status" ? (
        <Text key={e.id} variant="meta" style={styles.status}>{e.by}: {e.text} · {since(e.at)}</Text>
      ) : (
        <View key={e.id} style={[styles.entry, e.kind === "note" && styles.note, e.kind === "reply" && styles.reply, e.kind === "action" && styles.action]}
          accessible accessibilityLabel={`${e.by}${admin && e.kind === "note" ? ", admins only" : admin && e.kind === "reply" ? (e.missed ? ", not delivered" : `, sent to ${who}`) : ""}, ${since(e.at)}: ${e.text}`}>
          <View style={styles.head}>
            <Text variant="label" style={styles.by}>{e.by}</Text>
            {admin && e.kind === "note" ? <Text style={[styles.tag, styles.tagNote]}>Admins only</Text> : null}
            {admin && e.kind === "reply" ? (e.missed ? <Text style={[styles.tag, styles.tagMissed]}>Not delivered</Text>
              : <Text style={[styles.tag, styles.tagReply]}>Sent to {who}</Text>) : null}
            <Text variant="meta">{since(e.at)}</Text>
          </View>
          <Text variant="body" style={e.kind === "action" ? styles.actionText : styles.text}>{e.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.s },
  entry: { gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: color.panelRaised, borderWidth: 1, borderColor: "transparent" },
  note: { backgroundColor: "rgba(229, 160, 13, 0.1)", borderColor: "rgba(229, 160, 13, 0.35)" },
  reply: { backgroundColor: "rgba(255, 209, 228, 0.08)", borderColor: "rgba(255, 209, 228, 0.3)" },
  action: { backgroundColor: "transparent", borderColor: color.rule },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s },
  by: { color: color.ink },
  tag: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, overflow: "hidden" },
  tagNote: { color: AMBER, backgroundColor: "rgba(229, 160, 13, 0.16)" },
  tagReply: { color: color.screen, backgroundColor: "rgba(255, 209, 228, 0.14)" },
  tagMissed: { color: color.tally, backgroundColor: "rgba(255, 92, 147, 0.14)" },
  text: { color: color.ink },
  actionText: { color: color.slateInk },
  status: { textAlign: "center", paddingVertical: space.xs },
  pill: { alignSelf: "flex-start", fontSize: 12, lineHeight: 16, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden", fontFamily: font.semibold },
});

const pill = StyleSheet.create({
  hot: { backgroundColor: "rgba(255, 92, 147, 0.14)", color: color.tally },
  wait: { backgroundColor: "rgba(229, 160, 13, 0.16)", color: AMBER },
  done: { backgroundColor: "rgba(255, 209, 228, 0.16)", color: color.screen },
  plain: { backgroundColor: color.panelRaised, color: color.slateInk },
});
