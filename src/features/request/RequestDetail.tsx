// One request, start to finish: where it is on its journey, live progress, season by
// season, the admin's note, and "Something wrong?" for when it's stuck. Once asked, the
// ticket's conversation is here, with a box to answer when an admin asks something.
import { useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AppMemberTicket, AppRequest } from "../../api/schemas";
import { useApi, useServer } from "../../auth/session";
import { useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { DetailFallback, DetailPage, TitleHead, detailStyles } from "../../ui/DetailPage";
import { Text } from "../../ui/Text";
import { color, multilineInput, radius, replyRim } from "../../ui/theme";
import { KIND_LABEL, formatLabel, formatSlot, isBook, seasonsLabel, since } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { GlassFill, glass } from "../../ui/Glass";
import { SeasonsBox, StageBox } from "./StageBox";
import { useScrollToField } from "../../ui/keyboard";
import { useToast } from "../../ui/Toast";
import { useDraftGuard } from "../../ui/useDraftGuard";
import { Thread } from "../tickets/Thread";

const HELP_REASON: Record<string, string> = {
  stuck: "stuck downloading", notfound: "can’t be found", quality: "wrong version or quality",
  episodes: "wrong or missing episodes", playback: "won’t play", other: "something else",
};

export function RequestDetail() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const heading = useFocusHere();
  const { data, error, refetch, fetchStatus } = useRequests();
  const r = data?.find((x) => String(x.slot) === slot);
  const field = useScrollToField();

  if (!r) {
    return <DetailFallback error={error} errorTitle="Couldn’t load this request." onRetry={() => void refetch()}
      notFound={data ? "That request isn’t yours, or it’s gone." : undefined} offline={fetchStatus === "paused"} />;
  }

  const ended = r.stage === "declined" || r.stage === "closed";
  const book = isBook(r.title.kind);
  const canAsk = !!r.id && !ended && !r.help;

  return (
    <DetailPage scroll={field.scroll}>
        <TitleHead title={r.title} eyebrow={[`No. ${formatSlot(r.slot)}`, KIND_LABEL[r.title.kind], book ? formatLabel(r.title.kind, r.format) : null].filter(Boolean).join(" · ")}
          heading={heading}>
          {seasonsLabel(r.seasons, { long: true }) ? <Text variant="meta">{seasonsLabel(r.seasons, { long: true })}</Text> : null}
        </TitleHead>

        <StageBox r={r} />
        <SeasonsBox r={r} />

        {r.note ? (
          <View style={[detailStyles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="eyebrow">From the admins</Text>
            <Text variant="body" style={detailStyles.ink}>“{r.note}”</Text>
          </View>
        ) : null}

        <Text variant="meta">Requested {since(r.requestedAt)} · updated {since(r.updatedAt)}</Text>

        {r.help ? (
          <View onLayout={field.onLayout}>
            <YourTicket request={r} ticket={r.help} onFocus={field.onFocus} />
          </View>
        ) : canAsk ? (
          <Button kind="secondary" label="Something wrong? Ask for help" style={detailStyles.start}
            onPress={() => router.push({ pathname: "/help/[slot]", params: { slot: String(r.slot) } })} />
        ) : null}
    </DetailPage>
  );
}

/** The member's ticket: what they said and what the admins answered (not the admins'
 *  notes to each other), and a box to answer when an admin is waiting on them. */
function YourTicket({ request: r, ticket, onFocus }: { request: AppRequest; ticket: AppMemberTicket; onFocus: () => void }) {
  const client = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const server = useServer();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const solved = ticket.status === "resolved";
  // Only while the answer box is there to see.
  useDraftGuard(!!ticket.waiting && !solved && !!text.trim() && !busy);
  const reason = HELP_REASON[ticket.reason] ?? ticket.reason.toLowerCase();
  const answer = async () => {
    if (!text.trim() || !r.id) return;
    setBusy(true);
    setProblem("");
    try {
      const out = await client.answerTicket(r.id, text.trim());
      haptic.success();
      const mine = { id: `me${Date.now()}`, at: new Date().toISOString(), by: "You", kind: "member", text: text.trim() };
      // Shown straight away; the next poll confirms it.
      qc.setQueryData<AppRequest[]>(["requests", server], (rows) => rows?.map((x) =>
        (x.slot === r.slot && x.help ? { ...x, help: { ...x.help, waiting: false, thread: [...(x.help.thread ?? []), mine] } } : x)));
      setText("");
      toast({ text: "Sent to the admins", detail: out.message || undefined });
    } catch (e) {
      haptic.error();
      setProblem(e instanceof Error ? e.message : "That didn’t send. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[detailStyles.box, glass.surface, ticket.waiting && styles.asked]}>
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
  asked: { borderWidth: 1, ...replyRim(0.55) },
  askedText: { color: color.screen },
  input: { ...multilineInput, ...replyRim(0.6) },
  bad: { color: color.tally },
});
