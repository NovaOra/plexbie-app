// A ticket's timeline, as the website draws it: messages in boxes (an admin's note in
// amber, a reply to the member in pink) and what happened to it ("Took it", "Solved") as a
// quiet line between them. Admins see every entry; a member sees theirs and the replies.
import { StyleSheet, View } from "react-native";
import type { AppTicketEntry } from "../../api/schemas";
import { Text } from "../../ui/Text";
import { color, font, radius, space, tint } from "../../ui/theme";
import { formatSlot, since } from "../requests/stage";

const AMBER = "#f2c66d";

/** Where a ticket is, in words, and how loud to show it. */
export function ticketState(t: { status: string; waiting?: boolean; who?: string }) {
  if (t.status !== "open") return { label: "Solved", tone: "done" as const };
  return t.waiting ? { label: `Waiting on ${t.who ?? "them"}`, tone: "wait" as const } : { label: "Needs an admin", tone: "hot" as const };
}

/** What a ticket is about, as its eyebrow on Manage puts it: its request's number, "Title" or "General". */
export const ticketKind = (t: { subject: string; slot: number }) =>
  t.subject === "general" ? "General" : t.subject === "title" ? "Title" : `No. ${formatSlot(t.slot)}`;

/** Its heading on Manage: the film or show (a title ticket's with its year), or "General ticket". */
export function ticketTitle(t: { subject: string; title: string; year?: string | null }) {
  if (t.subject === "general" || !t.title) return "General ticket";
  return t.subject === "title" && t.year ? `${t.title} (${t.year})` : t.title;
}

/** What Plexbie writes as "what it saw" when it opens a ticket itself (the bot's season_search.open_help callers). */
const PLEXBIE_SAW = /^(Nothing found|Downloaded, import blocked|On Plex, as another film|Adding to Plex|Approved, not in (Sonarr|Radarr))$/;

/** Plexbie opened it, on its own (a search that found nothing, an import it won't take), filed
 *  under the member who asked. The bot says so (`byPlexbie`); an older one filed Plexbie's words
 *  as the member's first message, and it's worked out from what only Plexbie puts on a ticket. */
export function openedByPlexbie(t: { openedBy?: string | null; byPlexbie?: boolean; offer?: string | null; reasonCode?: string | null; statusThen?: string | null }) {
  if (t.openedBy) return t.openedBy === "Plexbie";
  if (t.byPlexbie !== undefined) return t.byPlexbie;
  return t.offer === "name" || t.reasonCode === "blocked" || t.reasonCode === "notreached" || PLEXBIE_SAW.test((t.statusThen ?? "").trim());
}

/** Its first message when Plexbie wrote it for the member, marked as Plexbie's (`plexbie`). An
 *  older bot filed it under the member, with the reason in front (the ticket's eyebrow says it). */
export function plexbieFirst(entries: AppTicketEntry[], t: { who: string; reason: string }): AppTicketEntry[] {
  return entries.map((e, i) => {
    if (e.plexbie || i || e.kind !== "member" || e.by !== t.who) return e;
    const lead = `${t.reason}. `;
    return { ...e, by: "Plexbie", plexbie: true, text: t.reason && e.text.startsWith(lead) ? e.text.slice(lead.length) : e.text };
  });
}

/** Who wrote an entry: Plexbie's first message on a ticket it opened itself is "Plexbie, for
 *  {who}" to the admins and "Plexbie" to the member, never the member's own. */
export const entryBy = (e: AppTicketEntry, who: string, admin: boolean) =>
  e.plexbie ? (admin ? `Plexbie, for ${who}` : "Plexbie") : e.by;

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
          accessible accessibilityLabel={`${entryBy(e, who, admin)}${admin && e.kind === "note" ? ", admins only" : admin && e.kind === "reply" ? (e.missed ? ", not delivered" : `, sent to ${who}`) : ""}, ${since(e.at)}: ${e.text}`}>
          <View style={styles.head}>
            <Text variant="label" style={styles.by}>{entryBy(e, who, admin)}</Text>
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
  note: { backgroundColor: tint(color.note, 0.1), borderColor: tint(color.note, 0.35) },
  reply: { backgroundColor: "rgba(255, 209, 228, 0.08)", borderColor: "rgba(255, 209, 228, 0.3)" },
  action: { backgroundColor: "transparent", borderColor: color.rule },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s },
  by: { color: color.ink },
  tag: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, overflow: "hidden" },
  tagNote: { color: AMBER, backgroundColor: tint(color.note, 0.16) },
  tagReply: { color: color.screen, backgroundColor: "rgba(255, 209, 228, 0.14)" },
  tagMissed: { color: color.tally, backgroundColor: "rgba(255, 92, 147, 0.14)" },
  text: { color: color.ink },
  actionText: { color: color.slateInk },
  status: { textAlign: "center", paddingVertical: space.xs },
  pill: { alignSelf: "flex-start", fontSize: 12, lineHeight: 16, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden", fontFamily: font.semibold },
});

const pill = StyleSheet.create({
  hot: { backgroundColor: "rgba(255, 92, 147, 0.14)", color: color.tally },
  wait: { backgroundColor: tint(color.note, 0.16), color: AMBER },
  done: { backgroundColor: "rgba(255, 209, 228, 0.16)", color: color.screen },
  plain: { backgroundColor: color.panelRaised, color: color.slateInk },
});
