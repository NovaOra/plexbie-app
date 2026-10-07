// One ticket, worked on in one place (Manage → Tickets): who has it, where its request
// is, the fixes, the whole conversation, and a box to add a note only admins see or a
// reply the member gets (a Discord DM or an alert, which they can answer). Then wait on
// them, solve it with a last word, or reopen it.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { HelpSearch } from "../../api/client";
import type { Ack } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { DetailFallback, DetailPage, detailStyles } from "../../ui/DetailPage";
import { GlassFill, glass } from "../../ui/Glass";
import { useScrollToField } from "../../ui/keyboard";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { useDraftGuard } from "../../ui/useDraftGuard";
import { useMe } from "../me/useMe";
import { StageBox } from "../request/StageBox";
import { formatSlot, seasonsLabel, since } from "../requests/stage";
import { Thread, TicketPill, ticketState } from "../tickets/Thread";
import { SEARCH_DONE, SearchFixes, StuckBox, card } from "./bits";
import { BlockedImport } from "./BlockedImport";
import { useAct, useAdminKey } from "./useAdmin";

export function AdminTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useApi();
  const key = useAdminKey();
  const qc = useQueryClient();
  const heading = useFocusHere();
  const who = useMe();
  const me = who.data?.user.name;
  const detailKey = [...key("tickets"), "ticket", id] as const;
  const { data: t, error, refetch } = useQuery({
    queryKey: detailKey, queryFn: ({ signal }) => client.adminTicket(id, signal), refetchInterval: 30_000,
  });
  const { busy, isBusy, act } = useAct();
  const [kind, setKind] = useState<"note" | "reply">("note");
  const [text, setText] = useState("");
  const [solving, setSolving] = useState(false);
  const [last, setLast] = useState("");
  const field = useScrollToField();
  // The note or reply, or the last word while solving it, unless it's on its way. A closed
  // ticket shows neither box.
  useDraftGuard(t?.status === "open" && ((!!text.trim() && !isBusy("send")) || (solving && !!last.trim() && !isBusy("solve"))));

  /** Runs an action, then reads the ticket back (and, a moment later, the lists it's on). */
  const run = async (busyKey: string, call: () => Promise<Ack>, done?: string) => {
    const out = await act(busyKey, call, {
      // Without a title of its own, the bot's sentence is the toast ("It's yours. …").
      done: (o) => (done ? { text: done, detail: o.message || undefined } : { text: o.message || "Done" }), refresh: ["tickets", "all", "help"],
    });
    if (out) void qc.invalidateQueries({ queryKey: detailKey });
    return !!out;
  };

  if (!t) return <DetailFallback error={error} errorTitle="Couldn’t load this ticket." onRetry={() => void refetch()} />;

  const state = ticketState(t);
  const open = t.status === "open";
  const mine = !!me && t.owner === me;
  const video = t.kind === "tv" || t.kind === "movie";
  const seasons = seasonsLabel(t.seasons);
  const them = t.who.split(" ")[0] || t.who;       // "Wait on Jordan" fits a half-width button
  const send = async () => {
    if (!text.trim()) return;
    if (await run("send", () => client.ticketComment(id, kind, text.trim()), kind === "reply" ? "Sent" : "Note added")) setText("");
  };
  const search = (how: HelpSearch) =>
    void run(how, () => client.helpSearch(id, how), SEARCH_DONE[how]);
  const solve = async () => {
    if (await run("solve", () => client.ticketStatus(id, "resolved", last.trim()), "Solved")) { setSolving(false); setLast(""); }
  };

  return (
    <DetailPage scroll={field.scroll}>
        <View style={styles.headText}>
          <Text variant="eyebrow">No. {formatSlot(t.slot)} · {t.reason}</Text>
          <Text ref={heading} style={detailStyles.name} accessibilityRole="header">{t.title}{seasons ? ` · ${seasons}` : ""}</Text>
          <Text variant="meta">{t.openedBy ? `Opened by ${t.openedBy}` : `Asked by ${t.who}`} {since(t.createdAt)}</Text>
        </View>

        <View style={styles.owner}>
          <View style={card.pills}>
            <TicketPill label={state.label} tone={state.tone} />
            <TicketPill label={t.owner ? `${t.owner} has it` : "Nobody has it yet"} tone="plain" />
          </View>
          {/* Taking it and letting it go are the same call, so the button waits until it's
              known whether the ticket is yours. */}
          {!open ? null : who.data ? (
            <Button kind="secondary" label={mine ? "Let it go" : t.owner ? "Take it over" : "Take it"} busy={busy === "take"} busyLabel="…"
              disabled={!!busy} onPress={() => void run("take", () => client.ticketTake(id))} />
          ) : who.error ? (
            <Button kind="secondary" label="Try again" busy={who.isFetching} busyLabel="Checking…" onPress={() => void who.refetch()}
              accessibilityLabel="Couldn’t check whether it’s yours. Try again" />
          ) : (
            <Button kind="secondary" label="…" busy onPress={() => undefined} accessibilityLabel="Checking whether it’s yours" />
          )}
        </View>

        {t.request ? (
          <>
            <StageBox r={t.request} />
            <StuckBox stuck={t.request.stuck} />
          </>
        ) : null}

        {t.blocked && open ? <BlockedImport target={t.blocked} onDone={() => void qc.invalidateQueries({ queryKey: detailKey })} /> : null}

        {video && open ? <SearchFixes kind={t.kind} busy={busy} onSearch={search} byName={t.offer === "name"} /> : null}

        <Thread entries={t.thread} who={t.who} admin />

        {!open ? (
          <Button kind="secondary" label="Reopen" busy={busy === "reopen"} busyLabel="Reopening…" disabled={!!busy}
            onPress={() => void run("reopen", () => client.ticketStatus(id, "open"), "Reopened")} />
        ) : solving ? (
          <View style={[detailStyles.box, glass.surface, styles.replyBox]} onLayout={field.onLayout}>
            <GlassFill radius={radius.m} />
            <Text variant="label" nativeID="ticket-last">Last word to {t.who} <Text variant="meta">(optional)</Text></Text>
            <TextInput value={last} onChangeText={setLast} multiline maxLength={600} autoFocus onFocus={field.onFocus}
              placeholder="Grabbed the 4K release, it’ll be on Plex tonight" placeholderTextColor={color.faint}
              accessibilityLabel={`Last word to ${t.who}, optional`} accessibilityLabelledBy="ticket-last" style={[styles.input, styles.inputReply]} />
            <View style={card.actions}>
              <Button kind="secondary" label="Back" onPress={() => { setSolving(false); setLast(""); }} style={card.grow} />
              <Button label="Solve it" busy={busy === "solve"} busyLabel="Solving…" disabled={!!busy} onPress={() => void solve()} style={card.grow} />
            </View>
          </View>
        ) : (
          <View style={[detailStyles.box, glass.surface, kind === "note" ? styles.noteBox : styles.replyBox]} onLayout={field.onLayout}>
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
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  headText: { gap: space.xs },
  owner: { gap: space.m },
  noteBox: { borderWidth: 1, borderColor: "rgba(229, 160, 13, 0.45)" },
  replyBox: { borderWidth: 1, borderColor: "rgba(255, 209, 228, 0.45)" },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  input: {
    minHeight: TOUCH * 2, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  inputNote: { borderColor: "rgba(229, 160, 13, 0.6)" },
  inputReply: { borderColor: "rgba(255, 209, 228, 0.6)" },
});
