// One of the member's own tickets, whatever it's about: what they said and what the admins
// said to them (not the admins' notes to each other), and a box to add to it while it's open,
// their answer when an admin asked something. Opened from Home, a title's page or an alert.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { ApiError } from "../../api/client";
import type { AppMyTicket } from "../../api/schemas";
import { useApi, useServer } from "../../auth/session";
import { useAnnounce, useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { DetailFallback, DetailPage, detailStyles } from "../../ui/DetailPage";
import { GlassFill, glass } from "../../ui/Glass";
import * as haptic from "../../ui/haptics";
import { useScrollToField } from "../../ui/keyboard";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, multilineInput, radius, replyRim, space } from "../../ui/theme";
import { useDraftGuard } from "../../ui/useDraftGuard";
import { since } from "../requests/stage";
import { Thread, TicketPill } from "./Thread";
import { headingFor, myState, useMyTickets } from "./mine";

export function MyTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const heading = useFocusHere();
  const { data, error, refetch, fetchStatus } = useMyTickets();
  const t = data?.find((x) => x.id === id);
  const field = useScrollToField();

  if (!t) {
    // A list from a while ago may not have it yet (an alert about one opened on the website):
    // it's looked for again before it's called gone.
    return <DetailFallback error={error} errorTitle="Couldn’t load your ticket." onRetry={() => void refetch()}
      notFound={data && fetchStatus === "idle" ? "That ticket isn’t yours, or it’s gone." : undefined} offline={fetchStatus === "paused"} />;
  }

  const state = myState(t);
  return (
    <DetailPage scroll={field.scroll}>
      <View style={styles.headText}>
        <Text ref={heading} style={detailStyles.name} accessibilityRole="header">{headingFor(t)}</Text>
        {/* A request's title isn't in its heading ("No. 0214"); a film or show's is. */}
        <Text variant="meta">{[t.subject === "request" ? t.title : null, t.reason].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={styles.state}>
        <TicketPill label={state.label} tone={state.tone} />
        {t.updatedAt ? <Text variant="meta">Updated {since(t.updatedAt)}</Text> : null}
      </View>
      <View onLayout={field.onLayout}>
        <Conversation key={t.id} t={t} onFocus={field.onFocus} />
      </View>
    </DetailPage>
  );
}

/** What was said, and the box to add to it. */
function Conversation({ t, onFocus }: { t: AppMyTicket; onFocus: () => void }) {
  const client = useApi();
  const server = useServer();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const open = t.status === "open";
  const asked = open && t.waiting;
  const reply = useMutation({
    mutationFn: (words: string) => client.replyTicket(t.id, words),
    onSuccess: (out, words) => {
      haptic.success();
      const mine = { id: `me${Date.now()}`, at: new Date().toISOString(), by: "You", kind: "member", text: words };
      // Shown straight away, then read back: a load already on its way from before it was sent
      // starts again rather than taking it off the screen.
      qc.setQueryData<AppMyTicket[]>(["myTickets", server], (rows) => rows?.map((x) =>
        (x.id === t.id ? { ...x, waiting: false, updatedAt: mine.at, thread: [...x.thread, mine] } : x)));
      setText("");
      toast({ text: "Sent to the admins", detail: out.message || undefined });
      void qc.invalidateQueries({ queryKey: ["myTickets"] });
      // Its request's card and the title's page say when an admin asked something.
      void qc.invalidateQueries({ queryKey: ["requests"] });
      void qc.invalidateQueries({ queryKey: ["title"] });
    },
    onError: (e) => {
      haptic.error();
      const unsure = e instanceof ApiError && e.unanswered;
      // Closed meanwhile, or in after all: the list says which.
      if (unsure || (e instanceof ApiError && e.status === 409)) void qc.invalidateQueries({ queryKey: ["myTickets"] });
      setProblem(unsure ? "No answer yet. It may have gone through, so check your ticket before you send it again."
        : e.message || "That didn’t send. Try again in a minute.");
    },
  });
  // Only while the box is there to see.
  useDraftGuard(open && !!text.trim() && !reply.isPending);
  useAnnounce(problem);
  const send = () => {
    if (!text.trim()) return;
    setProblem("");
    reply.mutate(text.trim());
  };

  return (
    <View style={[detailStyles.box, glass.surface, asked && styles.asked]}>
      <GlassFill radius={radius.m} />
      {t.thread.length ? <Thread entries={t.thread} who="you" admin={false} /> : null}
      {open ? (
        <>
          {asked ? null : <Text variant="meta">The admins have it. You’ll hear back here, and by Discord or an alert.</Text>}
          <Text variant="label" nativeID="ticket-reply" style={asked ? styles.askedText : undefined}>{asked ? "Your answer" : "Add to your ticket"}</Text>
          <TextInput value={text} onChangeText={setText} multiline maxLength={1200} onFocus={onFocus}
            accessibilityLabel={asked ? "Your answer" : "Add to your ticket"} accessibilityLabelledBy="ticket-reply" style={styles.input} />
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <Button label="Send to the admins" busy={reply.isPending} busyLabel="Sending…" disabled={!text.trim()} onPress={send} />
        </>
      ) : <Text variant="meta">Solved. If it’s still wrong, open a new ticket.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  headText: { gap: space.xs },
  state: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s },
  asked: { borderWidth: 1, ...replyRim(0.55) },
  askedText: { color: color.screen },
  input: { ...multilineInput, ...replyRim(0.6) },
  bad: { color: color.tally },
});
