// One ticket, worked on in one place (Manage → Tickets): who has it, where its request
// is, the fixes, the whole conversation, and a box to add a note only admins see or a
// reply the member gets (a Discord DM or an alert, which they can answer). Then wait on
// them, solve it with a last word, or reopen it.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HelpSearch } from "../../api/client";
import type { Ack } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Ambient, GlassFill, glass } from "../../ui/Glass";
import { KEYBOARD_BEHAVIOR, useScrollToField } from "../../ui/keyboard";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { useMe } from "../me/useMe";
import { StageBox } from "../request/StageBox";
import { formatSlot, since } from "../requests/stage";
import { Thread, TicketPill, ticketState } from "../tickets/Thread";
import { card } from "./bits";
import { BlockedImport } from "./BlockedImport";
import { seasonsChip } from "./RequestsSection";
import { useAct, useAdminKey } from "./useAdmin";

export function AdminTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useApi();
  const key = useAdminKey();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const heading = useFocusHere();
  const me = useMe().data?.user.name;
  const detailKey = [...key("tickets"), "ticket", id] as const;
  const { data: t, error, refetch } = useQuery({
    queryKey: detailKey, queryFn: ({ signal }) => client.adminTicket(id, signal), refetchInterval: 30_000,
  });
  const { busy, act } = useAct();
  const [kind, setKind] = useState<"note" | "reply">("note");
  const [text, setText] = useState("");
  const [solving, setSolving] = useState(false);
  const [last, setLast] = useState("");
  const field = useScrollToField();

  /** Runs an action, then reads the ticket back (and, a moment later, the lists it's on). */
  const run = async (busyKey: string, call: () => Promise<Ack>, done?: string) => {
    const out = await act(busyKey, call, {
      // Without a title of its own, the bot's sentence is the toast ("It's yours. …").
      done: (o) => (done ? { text: done, detail: o.message || undefined } : { text: o.message || "Done" }), refresh: ["tickets", "all", "help"],
    });
    if (out) void qc.invalidateQueries({ queryKey: detailKey });
    return !!out;
  };

  if (!t) {
    return (
      <View style={styles.page}>
        <BackHeader />
        <View style={styles.pad}>
          {error ? (
            <>
              <Text variant="title" accessibilityRole="alert">Couldn’t load this ticket.</Text>
              <Button kind="secondary" label="Try again" onPress={() => void refetch()} style={styles.start} />
            </>
          ) : <View style={styles.skeleton} accessibilityLabel="Loading" accessible />}
        </View>
      </View>
    );
  }

  const state = ticketState(t);
  const open = t.status === "open";
  const mine = !!me && t.owner === me;
  const video = t.kind === "tv" || t.kind === "movie";
  const seasons = seasonsChip(t.seasons);
  const them = t.who.split(" ")[0] || t.who;       // "Wait on Jordan" fits a half-width button
  const send = async () => {
    if (!text.trim()) return;
    if (await run("send", () => client.ticketComment(id, kind, text.trim()), kind === "reply" ? "Sent" : "Note added")) setText("");
  };
  const search = (how: HelpSearch) =>
    void run(how, () => client.helpSearch(id, how), { again: "Searching again", episodes: "Searching episode by episode", name: "Searching by name" }[how]);
  const solve = async () => {
    if (await run("solve", () => client.ticketStatus(id, "resolved", last.trim()), "Solved")) { setSolving(false); setLast(""); }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView ref={field.scroll} contentContainerStyle={[styles.pad, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.headText}>
          <Text variant="eyebrow">No. {formatSlot(t.slot)} · {t.reason}</Text>
          <Text ref={heading} style={styles.name} accessibilityRole="header">{t.title}{seasons ? ` · ${seasons}` : ""}</Text>
          <Text variant="meta">{t.openedBy ? `Opened by ${t.openedBy}` : `Asked by ${t.who}`} {since(t.createdAt)}</Text>
        </View>

        <View style={styles.owner}>
          <View style={card.pills}>
            <TicketPill label={state.label} tone={state.tone} />
            <TicketPill label={t.owner ? `${t.owner} has it` : "Nobody has it yet"} tone="plain" />
          </View>
          {open ? (
            <Button kind="secondary" label={mine ? "Let it go" : t.owner ? "Take it over" : "Take it"} busy={busy === "take"} busyLabel="…"
              disabled={!!busy} onPress={() => void run("take", () => client.ticketTake(id))} />
          ) : null}
        </View>

        {t.request ? (
          <>
            <StageBox r={t.request} />
            {t.request.stuck.length ? (
              <View style={[styles.box, styles.stuckBox]} accessibilityRole="summary" accessibilityLabel={`Looks stuck: ${t.request.stuck.join(". ")}`}>
                {t.request.stuck.map((s) => <Text key={s} variant="label" style={styles.stuck}>⚠︎ {s}</Text>)}
              </View>
            ) : null}
          </>
        ) : null}

        {t.blocked && open ? <BlockedImport target={t.blocked} onDone={() => void qc.invalidateQueries({ queryKey: detailKey })} /> : null}

        {video && open ? (
          <View style={styles.fixes}>
            <Button kind="secondary" label="Search again" busy={busy === "again"} busyLabel="Searching…" disabled={!!busy}
              onPress={() => search("again")} style={styles.fix} />
            {t.kind === "tv" ? (
              <Button kind="secondary" label="Episode by episode" busy={busy === "episodes"} busyLabel="Searching…" disabled={!!busy}
                onPress={() => search("episodes")} style={styles.fix} />
            ) : null}
            <Button kind={t.offer === "name" ? "primary" : "secondary"} label="Search by name" busy={busy === "name"} busyLabel="Starting…"
              disabled={!!busy} onPress={() => search("name")} style={styles.fix} />
          </View>
        ) : null}

        <Thread entries={t.thread} who={t.who} admin />

        {!open ? (
          <Button kind="secondary" label="Reopen" busy={busy === "reopen"} busyLabel="Reopening…" disabled={!!busy}
            onPress={() => void run("reopen", () => client.ticketStatus(id, "open"), "Reopened")} />
        ) : solving ? (
          <View style={[styles.box, glass.surface, styles.replyBox]} onLayout={field.onLayout}>
            <GlassFill radius={radius.m} />
            <Text variant="label" nativeID="ticket-last">Last word to {t.who} <Text variant="meta">(optional)</Text></Text>
            <TextInput value={last} onChangeText={setLast} multiline maxLength={600} autoFocus onFocus={field.onFocus}
              placeholder="Grabbed the 4K release, it’ll be on Plex tonight" placeholderTextColor={color.faint}
              accessibilityLabel={`Last word to ${t.who}, optional`} accessibilityLabelledBy="ticket-last" style={[styles.input, styles.inputReply]} />
            <View style={card.actions}>
              <Button kind="secondary" label="Back" onPress={() => { setSolving(false); setLast(""); }} style={card.grow} />
              <Button label="Solve it" busy={busy === "solve"} busyLabel="Solving…" onPress={() => void solve()} style={card.grow} />
            </View>
          </View>
        ) : (
          <View style={[styles.box, glass.surface, kind === "note" ? styles.noteBox : styles.replyBox]} onLayout={field.onLayout}>
            <GlassFill radius={radius.m} />
            <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Who sees it">
              <Chip label="Note for admins" selected={kind === "note"} onPress={() => setKind("note")} />
              <Chip label={`Reply to ${t.who}`} selected={kind === "reply"} onPress={() => setKind("reply")} />
            </View>
            <TextInput value={text} onChangeText={setText} multiline maxLength={1200} onFocus={field.onFocus}
              placeholder={kind === "note" ? "Only admins see this" : `${t.who} gets this as a Discord DM or an alert, and can answer`}
              placeholderTextColor={color.faint} accessibilityLabel={kind === "note" ? "Note for admins" : `Reply to ${t.who}`}
              style={[styles.input, kind === "note" ? styles.inputNote : styles.inputReply]} />
            <Button label={kind === "note" ? "Add note" : "Send reply"} busy={busy === "send"} busyLabel="Sending…"
              disabled={!text.trim() || !!busy} onPress={() => void send()} />
            <View style={card.actions}>
              <Button kind="secondary" label={t.waiting ? "Back to open" : `Wait on ${them}`} busy={busy === "status"} busyLabel="Saving…" disabled={!!busy}
                onPress={() => void run("status", () => client.ticketStatus(id, t.waiting ? "open" : "waiting"), t.waiting ? "Back with the admins" : `Waiting on ${t.who}`)}
                style={card.grow} />
              <Button kind="secondary" label="Solve…" disabled={!!busy} onPress={() => setSolving(true)} style={card.grow} />
            </View>
          </View>
        )}
      </ScrollView>
      <StatusBarScrim />
      <BackHeader overlay />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  pad: { paddingHorizontal: space.l, gap: space.l },
  start: { alignSelf: "flex-start" },
  headText: { gap: space.xs },
  name: { fontFamily: font.black, fontSize: 24, lineHeight: 28, color: color.ink },
  owner: { gap: space.m },
  box: { gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  stuckBox: { gap: space.s, backgroundColor: "rgba(255, 92, 147, 0.1)", borderColor: "rgba(255, 92, 147, 0.45)" },
  noteBox: { borderWidth: 1, borderColor: "rgba(229, 160, 13, 0.45)" },
  replyBox: { borderWidth: 1, borderColor: "rgba(255, 209, 228, 0.45)" },
  stuck: { color: color.tally },
  fixes: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  fix: { flexGrow: 1, flexBasis: 150 },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  input: {
    minHeight: TOUCH * 2, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  inputNote: { borderColor: "rgba(229, 160, 13, 0.6)" },
  inputReply: { borderColor: "rgba(255, 209, 228, 0.6)" },
  skeleton: { height: 160, borderRadius: radius.m, backgroundColor: color.panel },
});
