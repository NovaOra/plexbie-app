// Manage → Requests: requests waiting for a decision (help asked is on Manage → Tickets).
// Approve is one tap; Decline asks first. The card leaves at once and comes back with the
// error if the bot says no. No undo: a decision is final, here as in Discord.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { StyleSheet, View } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import type { AppAdminRequest, AppAdminRequests } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, radius, space } from "../../ui/theme";
import { KIND_LABEL, formatSlot, seasonsLabel, since } from "../requests/stage";
import { AllClear, Heading, Pill, card } from "./bits";
import { useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";

export function useRequestsCount(enabled = true) {
  const client = useApi();
  const key = useAdminKey();
  const requests = useQuery({ queryKey: key("requests"), queryFn: ({ signal }) => client.adminRequests(signal), refetchInterval: 30_000, enabled });
  return { requests, waiting: requests.data?.pending.length ?? 0 };
}

export function RequestsSection() {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const key = useAdminKey()("requests");
  const { requests } = useRequestsCount();

  const decide = useMutation({
    mutationFn: ({ r, approve }: { r: AppAdminRequest; approve: boolean }) => client.decide(r.id, approve),
    onMutate: async ({ r, approve }) => {
      await qc.cancelQueries({ queryKey: key });
      const at = qc.getQueryData<AppAdminRequests>(key)?.pending.findIndex((p) => p.id === r.id) ?? -1;
      qc.setQueryData<AppAdminRequests>(key, (d) => d && {
        ...d,
        pending: d.pending.filter((p) => p.id !== r.id),
        recent: [{ ...r, status: approve ? "approved" : "declined", resolvedBy: "you", resolvedAt: new Date().toISOString() }, ...d.recent],
      });
      return { at };
    },
    onSuccess: (out, { r, approve }) => {
      haptic.success();
      toast({ text: approve ? `Approved ${r.title}` : `Declined ${r.title}`, detail: out.message || undefined });
    },
    onError: (e, { r }, ctx) => {
      // Only this card comes back, where it was: another decision made meanwhile stays made.
      qc.setQueryData<AppAdminRequests>(key, (d) => {
        if (!d) return d;
        const pending = d.pending.filter((p) => p.id !== r.id);
        pending.splice(ctx && ctx.at >= 0 ? Math.min(ctx.at, pending.length) : pending.length, 0, r);
        return { ...d, pending, recent: d.recent.filter((p) => p.id !== r.id) };
      });
      haptic.error();
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
      <Heading title="Waiting for a decision" count={data.pending.length} />
      {data.pending.length ? data.pending.map((r) => (
        <Animated.View key={r.id} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(220)} style={[card.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <View style={card.top}>
            <Poster poster={r.poster} title={r.title} id={r.id} style={styles.poster} />
            <View style={card.body}>
              <Text variant="eyebrow">No. {formatSlot(r.slot)} · {KIND_LABEL[r.kind] ?? r.kind}</Text>
              <Text variant="title" numberOfLines={2}>{r.title}</Text>
              {seasonsLabel(r.seasons) ? <Pill label={seasonsLabel(r.seasons)!} /> : null}
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

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  message: { gap: space.s, paddingVertical: space.l },
  skeleton: { height: 170, borderRadius: radius.m, backgroundColor: color.panel },
  poster: { width: 64 },
  logRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  older: { marginTop: space.s },
});
