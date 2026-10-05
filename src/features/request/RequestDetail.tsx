// One request, start to finish: where it is on its journey, live progress, season by
// season, the admin's note, and "Something wrong?" for when it's stuck. Once asked, the
// ticket's conversation is here, with a box to answer when an admin asks something.
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppMemberTicket, AppRequest } from "../../api/schemas";
import { useApi, useSession } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { formatSlot, since } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { Ambient, GlassFill, glass } from "../../ui/Glass";
import { SeasonsBox, StageBox } from "./StageBox";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { KEYBOARD_BEHAVIOR, useScrollToField } from "../../ui/keyboard";
import { useToast } from "../../ui/Toast";
import { Thread } from "../tickets/Thread";

const KIND: Record<string, string> = { movie: "Film", tv: "TV", audiobook: "Audiobook", ebook: "Ebook" };
const HELP_REASON: Record<string, string> = {
  stuck: "stuck downloading", notfound: "can’t be found", quality: "wrong version or quality",
  episodes: "wrong or missing episodes", playback: "won’t play", other: "something else",
};


export function seasonsText(s: AppRequest["seasons"]) {
  if (s === "all") return "All seasons";
  if (s === "latest") return "Latest season + new episodes";
  return s?.length ? (s.length === 1 ? `Season ${s[0]}` : `Seasons ${s.join(", ")}`) : null;
}

export function RequestDetail() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const heading = useFocusHere();
  const insets = useSafeAreaInsets();
  const { data, error, refetch } = useRequests();
  const r = data?.find((x) => String(x.slot) === slot);
  const field = useScrollToField();

  if (!r) {
    return (
      <View style={styles.page}>
        <BackHeader />
        <View style={styles.pad}>
          {data || error ? (
            <>
              <Text variant="title" accessibilityRole="alert">{error ? "Couldn’t load this request." : "That request isn’t yours, or it’s gone."}</Text>
              {error ? <Button kind="secondary" label="Try again" onPress={() => void refetch()} style={styles.start} /> : null}
            </>
          ) : <View style={styles.skeleton} accessibilityLabel="Loading" accessible />}
        </View>
      </View>
    );
  }

  const ended = r.stage === "declined" || r.stage === "closed";
  const book = r.title.kind === "audiobook" || r.title.kind === "ebook";
  const canAsk = !!r.id && !ended && !r.help;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView ref={field.scroll} contentContainerStyle={[styles.pad, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Poster poster={r.title.poster} title={r.title.title} id={r.title.id} size="w342" style={styles.poster} />
          <View style={styles.headText}>
            <Text variant="eyebrow">{[`No. ${formatSlot(r.slot)}`, KIND[r.title.kind], r.format && book ? r.format : null].filter(Boolean).join(" · ")}</Text>
            <Text ref={heading} style={styles.name} accessibilityRole="header">{r.title.title}</Text>
            {seasonsText(r.seasons) ? <Text variant="meta">{seasonsText(r.seasons)}</Text> : null}
          </View>
        </View>

        <StageBox r={r} />
        <SeasonsBox r={r} />

        {r.note ? (
          <View style={[styles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="eyebrow">From the admins</Text>
            <Text variant="body" style={styles.ink}>“{r.note}”</Text>
          </View>
        ) : null}

        <Text variant="meta">Requested {since(r.requestedAt)} · updated {since(r.updatedAt)}</Text>

        {r.help ? (
          <View onLayout={field.onLayout}>
            <YourTicket request={r} ticket={r.help} onFocus={field.onFocus} />
          </View>
        ) : canAsk ? (
          <Button kind="secondary" label="Something wrong? Ask for help" style={styles.start}
            onPress={() => router.push({ pathname: "/help/[slot]", params: { slot: String(r.slot) } })} />
        ) : null}
      </ScrollView>
      <StatusBarScrim />
      <BackHeader overlay />
    </KeyboardAvoidingView>
  );
}

/** The member's ticket: what they said and what the admins answered (not the admins'
 *  notes to each other), and a box to answer when an admin is waiting on them. */
function YourTicket({ request: r, ticket, onFocus }: { request: AppRequest; ticket: AppMemberTicket; onFocus: () => void }) {
  const client = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const { state } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const solved = ticket.status === "resolved";
  const reason = HELP_REASON[ticket.reason] ?? ticket.reason.toLowerCase();
  const answer = async () => {
    if (!text.trim() || !r.id) return;
    setBusy(true);
    setProblem("");
    try {
      const out = await client.answerTicket(r.id, text.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const mine = { id: `me${Date.now()}`, at: new Date().toISOString(), by: "You", kind: "member", text: text.trim() };
      // Shown straight away; the next poll confirms it.
      qc.setQueryData<AppRequest[]>(["requests", state.phase === "signedIn" ? state.server : ""], (rows) => rows?.map((x) =>
        (x.slot === r.slot && x.help ? { ...x, help: { ...x.help, waiting: false, thread: [...(x.help.thread ?? []), mine] } } : x)));
      setText("");
      toast({ text: "Sent to the admins", detail: out.message || undefined });
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setProblem(e instanceof Error ? e.message : "That didn’t send. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.box, glass.surface, ticket.waiting && styles.asked]}>
      <GlassFill radius={radius.m} />
      <Text variant="eyebrow" accessibilityRole="header" style={ticket.waiting && !solved ? styles.askedText : undefined}>{ticket.waiting ? "An admin asked you something" : solved ? "Your ticket · solved" : "Your ticket"}</Text>
      <Text variant="label">Help asked: {reason}.</Text>
      {ticket.thread?.length ? <Thread entries={ticket.thread} who="you" admin={false} /> : null}
      {ticket.waiting && !solved ? (
        <>
          <Text variant="label" nativeID="ticket-answer">Your answer</Text>
          <TextInput value={text} onChangeText={setText} multiline maxLength={1200} onFocus={onFocus}
            accessibilityLabel="Your answer" accessibilityLabelledBy="ticket-answer" style={styles.input} />
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <Button label="Send to the admins" busy={busy} busyLabel="Sending…" disabled={!text.trim()} onPress={() => void answer()} />
        </>
      ) : !solved ? <Text variant="meta">An admin will get back to you, here and in your messages.</Text> : null}
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
  ink: { color: color.ink },
  asked: { borderWidth: 1, borderColor: "rgba(255, 209, 228, 0.55)" },
  askedText: { color: color.screen },
  input: {
    minHeight: 96, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: "rgba(255, 209, 228, 0.6)",
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  bad: { color: color.tally },
  skeleton: { height: 160, borderRadius: radius.m, backgroundColor: color.panel },
});
