// Manage → Requests: help asked by members (search again, resolve with a reply), then
// requests waiting for a decision. Approve is one tap; Decline asks first. The card
// leaves at once and comes back with the error if the bot says no. No undo: a decision
// is final, here as in Discord.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import type { HelpSearch } from "../../api/client";
import type { AppAdminHelp, AppAdminRequest, AppAdminRequests } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, font, radius, space } from "../../ui/theme";
import { formatSlot, since } from "../requests/stage";
import { AllClear, Heading, Initial, Pill, card } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";

const KIND: Record<string, string> = { movie: "Film", tv: "TV", audiobook: "Audiobook", ebook: "Ebook" };

export function seasonsChip(s: AppAdminRequest["seasons"] | AppAdminHelp["seasons"]) {
  if (s === "all") return "All seasons";
  if (s === "latest") return "Latest season";
  return s?.length ? s.map((n) => `S${n}`).join(", ") : null;
}

export function useRequestsCount() {
  const client = useApi();
  const key = useAdminKey();
  const requests = useQuery({ queryKey: key("requests"), queryFn: ({ signal }) => client.adminRequests(signal), refetchInterval: 30_000 });
  const help = useQuery({ queryKey: key("help"), queryFn: ({ signal }) => client.adminHelp(signal), refetchInterval: 60_000 });
  return { requests, help, waiting: (requests.data?.pending.length ?? 0) + (help.data?.filter((h) => h.status === "open").length ?? 0) };
}

export function RequestsSection() {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const key = useAdminKey()("requests");
  const { requests, help } = useRequestsCount();

  const decide = useMutation({
    mutationFn: ({ r, approve }: { r: AppAdminRequest; approve: boolean }) => client.decide(r.id, approve),
    onMutate: async ({ r, approve }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<AppAdminRequests>(key);
      qc.setQueryData<AppAdminRequests>(key, (d) => d && {
        ...d,
        pending: d.pending.filter((p) => p.id !== r.id),
        recent: [{ ...r, status: approve ? "approved" : "declined", resolvedBy: "you", resolvedAt: new Date().toISOString() }, ...d.recent],
      });
      return { before };
    },
    onSuccess: (out, { r, approve }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast({ text: approve ? `Approved ${r.title}` : `Declined ${r.title}`, detail: out.message || undefined });
    },
    onError: (e, { r }, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast({ tone: "error", text: `${r.title} wasn’t decided`, detail: e.message });
    },
    // The bot takes a moment to post to Discord and Seerr; then read the truth back.
    onSettled: () => setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 2500),
  });

  const confirmDecline = (r: AppAdminRequest) =>
    confirm(`Decline ${r.title}?`, `${r.requester} is told it won’t be added. This can’t be undone.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => decide.mutate({ r, approve: false }) },
    ]);

  const data = requests.data;
  if (!data) {
    return requests.error ? (
      <View style={styles.message}>
        <Text variant="title" accessibilityRole="alert">Couldn’t load the queue.</Text>
        <Text variant="body">{requests.error.message}</Text>
        <Button kind="secondary" label="Try again" onPress={() => void requests.refetch()} style={styles.start} />
      </View>
    ) : <>{[0, 1].map((i) => <View key={i} style={styles.skeleton} />)}</>;
  }

  return (
    <>
      <NeedsHelp help={help.data ?? []} />
      <Heading title="Waiting for a decision" count={data.pending.length} />
      {data.pending.length ? data.pending.map((r) => (
        <Animated.View key={r.id} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(220)} style={[card.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <View style={card.top}>
            <Poster poster={r.poster} title={r.title} id={r.id} style={styles.poster} />
            <View style={card.body}>
              <Text variant="eyebrow">No. {formatSlot(r.slot)} · {KIND[r.kind] ?? r.kind}</Text>
              <Text variant="title" numberOfLines={2}>{r.title}</Text>
              {seasonsChip(r.seasons) ? <Pill label={seasonsChip(r.seasons)!} /> : null}
              <Text variant="meta">{r.requester} asked {since(r.requestedAt)}</Text>
            </View>
          </View>
          <View style={card.actions}>
            <Button label="Approve" onPress={() => decide.mutate({ r, approve: true })} style={card.grow}
              accessibilityLabel={`Approve ${r.title} for ${r.requester}`} />
            <Button kind="danger" label="Decline" onPress={() => confirmDecline(r)} style={card.grow}
              accessibilityLabel={`Decline ${r.title} for ${r.requester}`} />
          </View>
        </Animated.View>
      )) : <AllClear title="All caught up">Every request has an answer. New ones show up here and in Discord.</AllClear>}

      {data.recent.length ? (
        <>
          <Heading title="Recently decided" />
          {data.recent.slice(0, 12).map((r) => (
            <View key={r.id} style={styles.logRow}>
              <Pill label={r.status === "approved" ? "Approved" : "Declined"} tone={r.status === "approved" ? "ok" : "plain"} />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{r.title}</Text>
                <Text variant="meta" numberOfLines={2}>
                  {r.requester}{r.resolvedBy ? ` · by ${r.resolvedBy}` : ""}{r.resolvedAt ? ` ${since(r.resolvedAt)}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}
      {data.older.length ? (
        <Text variant="meta" style={styles.older}>
          {data.older.length} older request{data.older.length === 1 ? "" : "s"} from before outcomes were recorded are on the website’s Manage page.
        </Text>
      ) : null}
    </>
  );
}

function NeedsHelp({ help }: { help: AppAdminHelp[] }) {
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("help");
  const { busy, act } = useAct();
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const open = help.filter((h) => h.status === "open");
  if (!open.length) return null;

  const search = (h: AppAdminHelp, how: HelpSearch) =>
    act(h.id, () => client.helpSearch(h.id, how), {
      done: (out) => ({
        text: { again: "Searching again", episodes: "Searching episode by episode", name: "Searching by name" }[how],
        detail: out.message || undefined,
      }),
      failText: "Couldn’t search", refresh: ["help"],
    });
  const resolve = async (h: AppAdminHelp) => {
    const out = await act(h.id, () => client.helpResolve(h.id, reply.trim()), {
      done: (o) => ({ text: `Resolved No. ${formatSlot(h.slot)}`, detail: o.message || undefined }), refresh: ["help"],
    });
    if (!out) return;
    setReplying(null);
    setReply("");
    qc.setQueryData<AppAdminHelp[]>(key, (d) => d?.map((x) => (x.id === h.id ? { ...x, status: "resolved" } : x)));
  };

  return (
    <>
      <Heading title="Needs help" count={open.length} />
      {open.map((h) => (
        <Animated.View key={h.id} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(220)} style={[card.box, glass.surface, styles.helpBox]}>
          <GlassFill radius={radius.m} />
          <View style={card.top}>
            <Initial name={h.who} />
            <View style={card.body}>
              <Text variant="eyebrow">No. {formatSlot(h.slot)} · asked {since(h.created_at)}</Text>
              <Text variant="title">{h.title}{seasonsChip(h.seasons) ? ` · ${seasonsChip(h.seasons)}` : ""}</Text>
              <Text variant="meta"><Text variant="meta" style={styles.ink}>{h.who}</Text>: {h.reason}</Text>
              {h.note ? <Text variant="body" style={styles.note}>“{h.note}”</Text> : null}
              <Text variant="meta">Plexbie saw: {h.status_then || "nothing yet"}</Text>
              {h.actions?.length ? <Text variant="meta">{h.actions.map((a) => `${a.by}: ${a.did}`).join(" · ")}</Text> : null}
            </View>
          </View>
          {replying === h.id ? (
            <>
              <TextInput value={reply} onChangeText={setReply} multiline maxLength={600} autoFocus
                placeholder={`Optional: tell ${h.who} what you did`} placeholderTextColor={color.faint}
                accessibilityLabel={`Reply to ${h.who}`} style={styles.reply} />
              <View style={card.actions}>
                <Button kind="secondary" label="Back" onPress={() => { setReplying(null); setReply(""); }} style={card.grow} accessibilityLabel={`Back, don’t resolve No. ${formatSlot(h.slot)}`} />
                <Button label="Mark resolved" busy={busy === h.id} busyLabel="Saving…" onPress={() => void resolve(h)} style={card.grow}
                  accessibilityLabel={`Mark resolved, No. ${formatSlot(h.slot)}, ${h.title}`} />
              </View>
            </>
          ) : (
            <>
              {["tv", "movie"].includes(h.kind) ? (
                <Button kind={h.offer === "name" ? "primary" : "secondary"} label="Search by name" disabled={busy === h.id}
                  onPress={() => void search(h, "name")} accessibilityLabel={`Search by name instead of its IDs, ${h.title}`} />
              ) : null}
              {h.kind === "tv" ? (
                <Button kind="secondary" label="Search episode by episode" disabled={busy === h.id} onPress={() => void search(h, "episodes")}
                  accessibilityLabel={`Search episode by episode, ${h.title}`} />
              ) : null}
              <View style={card.actions}>
                <Button kind="secondary" label="Search again" busy={busy === h.id} disabled={!["tv", "movie"].includes(h.kind)}
                  onPress={() => void search(h, "again")} style={card.grow} accessibilityLabel={`Search again, ${h.title}`} />
                <Button label="Resolve" onPress={() => setReplying(h.id)} style={card.grow} accessibilityLabel={`Resolve, ${h.title}`} />
              </View>
            </>
          )}
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  message: { gap: space.s, paddingVertical: space.l },
  skeleton: { height: 170, borderRadius: radius.m, backgroundColor: color.panel },
  poster: { width: 64 },
  logRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  older: { marginTop: space.s },
  helpBox: { borderColor: "rgba(255, 92, 147, 0.45)" },
  ink: { color: color.ink, fontFamily: font.semibold },
  note: { color: color.ink, fontStyle: "italic" },
  reply: {
    minHeight: 88, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.field,
    color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
});
