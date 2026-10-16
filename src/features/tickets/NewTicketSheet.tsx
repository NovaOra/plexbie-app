// "What's wrong with Sintel?", or a general ticket: pick a reason, add a note, and the admins
// hear about it at once (POST /api/tickets), with what Plexbie can see of the file and of how
// the member last played it. A native sheet, like the help sheet on a request; once the
// ticket is in, it closes, and the ticket is on the title's page and Home's list. (Replacing
// the sheet with the ticket screen left iOS with a screen Back couldn't pop.)
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, type NewTicket } from "../../api/client";
import type { AppMyTicket } from "../../api/schemas";
import type { TicketReason } from "../../api/types";
import { useApi, useServer } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import * as haptic from "../../ui/haptics";
import { KEYBOARD_BEHAVIOR, useScrollToField } from "../../ui/keyboard";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, multilineInput, space } from "../../ui/theme";
import { useDraftGuard } from "../../ui/useDraftGuard";
import { ticketDrafts as drafts } from "../request/helpDrafts";
import { olderBot } from "./mine";

/** What can be wrong with a film or show on Plex ("episodes" for a show only), with a line under each. */
const TITLE_REASONS: [TicketReason, string, string?][] = [
  ["playback", "Won’t play on Plex", "It won’t start, stops, or keeps buffering"],
  ["picture", "Picture looks wrong", "Washed out, wrong colours, or blurry"],
  ["audio", "Sound or subtitles", "No sound, out of sync, wrong language, or subtitles"],
  ["wrongfilm", "Wrong film or episode", "It’s a different film, or the wrong episode"],
  ["episodes", "Missing episodes", "Episodes are missing from a season"],
  ["other", "Something else"],
];
/** ...and with nothing in particular. */
const GENERAL_REASONS: [TicketReason, string, string?][] = [
  ["access", "Can’t get in, or nothing plays", "You can’t get into Plex, or nothing will play at all"],
  ["other", "Something else"],
];

type About = { kind: "movie" | "tv"; id: string; title: string };

/** The film or show the link names (its kind, TMDB id and title); null for a general ticket,
 *  "bad" for a link that names something else. */
function aboutFrom(p: { kind?: unknown; id?: unknown; title?: unknown }): About | null | "bad" {
  if (!p.kind && !p.id) return null;
  if ((p.kind === "movie" || p.kind === "tv") && typeof p.id === "string" && /^\d{1,12}$/.test(p.id)) {
    return { kind: p.kind, id: p.id, title: typeof p.title === "string" ? p.title.slice(0, 200) : "" };
  }
  return "bad";
}

/** Why it didn't go in: the bot's own sentence when it gave one. */
function refusal(e: unknown) {
  if (olderBot(e)) return "This Plexbie is older and can’t take tickets here yet. Ask an admin to update it.";
  if (e instanceof ApiError && e.unanswered) return "No answer yet. It may have gone through, so look under Your tickets on Home before you send it again.";
  return e instanceof Error && e.message ? e.message : "That didn’t send. Try again in a minute.";
}

export function NewTicketSheet() {
  const about = aboutFrom(useLocalSearchParams<{ kind?: string; id?: string; title?: string }>());
  const insets = useSafeAreaInsets();
  const client = useApi();
  const server = useServer();
  const qc = useQueryClient();
  const toast = useToast();
  const draftKey = `${server} ${about && about !== "bad" ? `${about.kind}/${about.id}` : "general"}`;
  const [reason, setReason] = useState<TicketReason | null>(() => drafts.get(draftKey)?.reason ?? null);
  const [note, setNote] = useState(() => drafts.get(draftKey)?.note ?? "");
  const field = useScrollToField();
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (note.trim()) drafts.set(draftKey, { reason, note });
    else drafts.delete(draftKey);
  }, [draftKey, reason, note]);

  // Whether or not the sheet is still open when the answer comes (it can be swiped away while
  // it's sending): the ticket goes on the member's list and the title's page, and they're told.
  const open = useMutation({
    mutationFn: (body: NewTicket) => client.openTicket(body),
    onSuccess: (out) => {
      haptic.reward();
      // Straight away; the next loads confirm it.
      const ticket = out.ticket;
      if (ticket) qc.setQueryData<AppMyTicket[]>(["myTickets", server], (rows) => [ticket, ...(rows ?? []).filter((x) => x.id !== ticket.id)]);
      void qc.invalidateQueries({ queryKey: ["myTickets"] });
      void qc.invalidateQueries({ queryKey: ["title"] });
      toast({ text: "Sent to the admins", detail: out.message || undefined });
      drafts.delete(draftKey);
    },
    onError: (e) => {
      // It may be in after all, or one is open already ("add to it there"): the list and the
      // title's page show which.
      if (e instanceof ApiError && (e.unanswered || e.status === 409)) {
        void qc.invalidateQueries({ queryKey: ["myTickets"] });
        void qc.invalidateQueries({ queryKey: ["title"] });
      }
    },
  });
  // While it's sending, there's nothing to lose; nor when there's no box to have typed in.
  const sent = useDraftGuard(about !== "bad" && !!note.trim() && !open.isPending, () => drafts.delete(draftKey));

  useAnnounce(problem);                  // before any early return: hooks run in the same order every render
  if (about === "bad") {
    return (
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
        <Text variant="title">This can’t take a ticket.</Text>
        <Text variant="meta">That link doesn’t point at a film or show.</Text>
        <Button kind="quiet" label="Close" onPress={() => router.back()} style={styles.start} />
      </View>
    );
  }

  const reasons = about ? TITLE_REASONS.filter(([id]) => id !== "episodes" || about.kind === "tv") : GENERAL_REASONS;
  const send = () => {
    if (!reason) return;
    if (reason === "other" && !note.trim()) { setProblem("Say a little about what’s wrong."); return; }
    setProblem("");
    // Only while the sheet is still there: one swiped away closes nothing else.
    open.mutate(about ? { kind: about.kind, id: about.id, reason, note: note.trim() } : { reason, note: note.trim() }, {
      onSuccess: () => { sent(); router.back(); },
      onError: (e) => { haptic.error(); setProblem(refusal(e)); },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={KEYBOARD_BEHAVIOR}>
      <ScrollView ref={field.scroll} contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + space.l }]} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header" style={styles.heading}>
          {about ? `What’s wrong with ${about.title || "it"}?` : "What do you need help with?"}
        </Text>
        <Text variant="meta">
          {about ? "The admins get this straight away, with what Plexbie can see of the file and of how you last played it."
            : "For anything that isn’t about one film or show: Plex itself, your account, or something you can’t find. The admins get it straight away."}
        </Text>
        <View style={styles.reasons} accessibilityRole="radiogroup" accessibilityLabel="What’s wrong">
          {reasons.map(([id, label, hint]) => <Chip key={id} label={label} hint={hint} selected={reason === id} onPress={() => setReason(id)} />)}
        </View>
        <Text variant="label" nativeID="ticket-note">
          Anything else? <Text variant="meta">{reason === "other" ? "(needed)" : "(optional)"}</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          onLayout={field.onLayout}
          onFocus={field.onFocus}
          multiline
          maxLength={600}
          placeholder={about ? "It looks grey and washed out on my TV" : "Plex says I don’t have access any more"}
          placeholderTextColor={color.faint}
          accessibilityLabel={`Anything else, ${reason === "other" ? "needed" : "optional"}`}
          accessibilityLabelledBy="ticket-note"
          style={styles.note}
        />
        {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
        <Button label={reason ? "Send to the admins" : "Pick what’s wrong"} disabled={!reason} busy={open.isPending} busyLabel="Sending…" onPress={send} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: space.l, paddingTop: space.xl, gap: space.m, backgroundColor: color.panel },
  heading: { fontSize: 20, lineHeight: 26 },
  start: { alignSelf: "flex-start" },
  reasons: { gap: space.s },
  note: multilineInput,
  bad: { color: color.tally },
});
