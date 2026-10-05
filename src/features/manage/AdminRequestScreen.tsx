// One request in full, for an admin (Manage → All requests): where it is, who asked, why it
// looks stuck, its tickets and history, the fixes (search again, episode by episode, by
// name), and "Open a ticket", which goes on Needs help like a member's would.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HelpSearch } from "../../api/client";
import type { AppAdminRequestDetail, AppAdminTicket } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Ambient, GlassFill, glass } from "../../ui/Glass";
import { Poster } from "../../ui/Poster";
import { SwitchRow } from "../../ui/SwitchRow";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { seasonsText } from "../request/RequestDetail";
import { SeasonsBox, StageBox } from "../request/StageBox";
import { formatSlot, since, stageLabel } from "../requests/stage";
import { card } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";

const KIND: Record<string, string> = { movie: "Film", tv: "TV", audiobook: "Audiobook", ebook: "Ebook" };

/** A ticket in the request's history, in a sentence. */
function ticketLine(t: AppAdminTicket) {
  const head = t.opened_by ? `${t.opened_by} opened a ticket` : `${t.who ?? "They"} asked for help: ${t.reason}`;
  const note = t.note ? ` (“${t.note}”)` : "";
  const end = t.status === "resolved" ? `. Resolved by ${t.resolved_by ?? "an admin"}${t.reply ? `: ${t.reply}` : ""}` : ". Still open";
  return head + note + end;
}

export function AdminRequestScreen() {
  const { key: id } = useLocalSearchParams<{ key: string }>();
  const client = useApi();
  const key = useAdminKey();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const heading = useFocusHere();
  const detailKey = [...key("all"), "request", id] as const;
  const { data: r, error, refetch } = useQuery({
    queryKey: detailKey, queryFn: ({ signal }) => client.adminRequest(id, signal), refetchInterval: 30_000,
  });
  const { busy, act } = useAct();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [tell, setTell] = useState(false);

  const after = () => setTimeout(() => {
    void qc.invalidateQueries({ queryKey: detailKey });
    void qc.invalidateQueries({ queryKey: key("all") });
    void qc.invalidateQueries({ queryKey: key("help") });
  }, 900);
  const search = async (how: HelpSearch) => {
    const out = await act(how, () => client.requestSearch(id, how), {
      failText: "Couldn’t search",
      done: (o) => ({ text: { again: "Searching again", episodes: "Searching episode by episode", name: "Searching by name" }[how], detail: o.message }),
    });
    if (out) after();
  };
  const ticket = async () => {
    const out = await act("ticket", () => client.requestTicket(id, note.trim(), tell), {
      failText: "Couldn’t open the ticket", done: (o) => ({ text: "Ticket opened", detail: o.message }), refresh: ["help", "requests"],
    });
    if (!out) return;
    setWriting(false);
    setNote("");
    after();
  };

  if (!r) {
    return (
      <View style={styles.page}>
        <BackHeader />
        <View style={styles.pad}>
          {error ? (
            <>
              <Text variant="title" accessibilityRole="alert">Couldn’t load this request.</Text>
              <Button kind="secondary" label="Try again" onPress={() => void refetch()} style={styles.start} />
            </>
          ) : <View style={styles.skeleton} accessibilityLabel="Loading" accessible />}
        </View>
      </View>
    );
  }

  const openTicket = r.tickets.find((t) => t.status === "open");
  const video = r.title.kind === "tv" || r.title.kind === "movie";
  const history = [
    ...r.tickets.map((t) => ({ at: t.created_at, text: ticketLine(t) })),
    ...r.activity.map((a) => ({ at: a.at, text: `${a.by}: ${a.did}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Ambient />
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Poster poster={r.title.poster} title={r.title.title} id={r.title.id} size="w342" style={styles.poster} />
          <View style={styles.headText}>
            <Text variant="eyebrow">{[`No. ${formatSlot(r.slot)}`, KIND[r.title.kind]].filter(Boolean).join(" · ")}</Text>
            <Text ref={heading} style={styles.name} accessibilityRole="header">{r.title.title}</Text>
            {seasonsText(r.seasons) ? <Text variant="meta">{seasonsText(r.seasons)}</Text> : null}
            <Text variant="meta">Asked {since(r.requestedAt)} by {r.requester} · via {r.via}</Text>
          </View>
        </View>

        {r.stuck.length ? (
          <View style={[styles.box, styles.stuckBox]} accessibilityRole="summary" accessibilityLabel={`Looks stuck: ${r.stuck.join(". ")}`}>
            {r.stuck.map((s) => <Text key={s} variant="label" style={styles.stuck}>⚠︎ {s}</Text>)}
          </View>
        ) : null}

        <StageBox r={r} />
        <SeasonsBox r={r} />

        <Facts r={r} />

        {video ? (
          <View style={styles.fixes}>
            <Button kind="secondary" label="Search again" busy={busy === "again"} busyLabel="Searching…" disabled={!!busy}
              onPress={() => void search("again")} style={styles.fix} />
            {r.title.kind === "tv" ? (
              <Button kind="secondary" label="Episode by episode" busy={busy === "episodes"} busyLabel="Searching…" disabled={!!busy}
                onPress={() => void search("episodes")} style={styles.fix} />
            ) : null}
            <Button kind="secondary" label="Search by name" busy={busy === "name"} busyLabel="Starting…" disabled={!!busy}
              onPress={() => void search("name")} style={styles.fix} />
          </View>
        ) : null}

        {openTicket ? (
          <View style={[styles.box, glass.surface]} accessibilityRole="summary">
            <GlassFill radius={radius.m} />
            <Text variant="label">There’s an open ticket on this: {openTicket.reason}.</Text>
            <Text variant="meta">Resolve it from Needs help, in the Requests section.</Text>
          </View>
        ) : writing ? (
          <View style={[styles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="label" nativeID="ticket-note">What’s wrong, or what you’ve found</Text>
            <TextInput value={note} onChangeText={setNote} multiline maxLength={600} autoFocus
              placeholder="For example: the indexer had nothing, trying another release" placeholderTextColor={color.faint}
              accessibilityLabel="What’s wrong, or what you’ve found" accessibilityLabelledBy="ticket-note" style={styles.input} />
            <SwitchRow label={`Let ${r.requester} know an admin is looking into it`} value={tell} onValueChange={setTell}>
              <Text variant="body" style={styles.ink}>Let {r.requester} know an admin is looking into it</Text>
            </SwitchRow>
            <View style={card.actions}>
              <Button kind="secondary" label="Back" onPress={() => { setWriting(false); setNote(""); }} style={card.grow} />
              <Button label="Open the ticket" busy={busy === "ticket"} busyLabel="Opening…" disabled={!note.trim()}
                onPress={() => void ticket()} style={card.grow} />
            </View>
          </View>
        ) : (
          <Button label="Open a ticket" onPress={() => setWriting(true)} />
        )}

        {history.length ? (
          <View style={[styles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="title" accessibilityRole="header">History</Text>
            {history.map((e, n) => (
              <Text key={n} variant="meta"><Text variant="meta" style={styles.when}>{since(e.at)} </Text><Text variant="meta" style={styles.ink}>{e.text}</Text></Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <BackHeader overlay />
    </KeyboardAvoidingView>
  );
}

function Facts({ r }: { r: AppAdminRequestDetail }) {
  const rows = [
    r.approvedAt ? ["Approved", `${since(r.approvedAt)}${r.approvedBy ? ` by ${r.approvedBy}` : ""}`] : null,
    r.stageSince && r.stage !== "available" ? [stageLabel(r.stage, r.title.kind), `since ${since(r.stageSince)}`] : null,
    r.finishedAt ? ["On Plex", `since ${since(r.finishedAt)}`] : null,
    r.seerrId ? ["Seerr", `request #${r.seerrId}`] : null,
  ].filter(Boolean) as [string, string][];
  if (!rows.length) return null;
  return (
    <View style={styles.facts}>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.fact}>
          <Text variant="meta" style={styles.factKey}>{k}</Text>
          <Text variant="body" style={[styles.ink, styles.factValue]}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  pad: { paddingHorizontal: space.l, gap: space.l },
  start: { alignSelf: "flex-start" },
  head: { flexDirection: "row", alignItems: "flex-end", gap: space.l },
  poster: { width: 104 },
  headText: { flex: 1, gap: space.xs },
  name: { fontFamily: font.black, fontSize: 24, lineHeight: 28, color: color.ink },
  box: { gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  stuckBox: { gap: space.s, backgroundColor: "rgba(255, 92, 147, 0.1)", borderColor: "rgba(255, 92, 147, 0.45)" },
  stuck: { color: color.tally },
  ink: { color: color.ink },
  when: { color: color.faint },
  facts: { gap: space.s },
  fact: { flexDirection: "row", gap: space.m },
  factKey: { width: 104 },
  factValue: { flex: 1 },
  fixes: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  fix: { flexGrow: 1, flexBasis: 150 },
  input: {
    minHeight: TOUCH * 2, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  skeleton: { height: 160, borderRadius: radius.m, backgroundColor: color.panel },
});
