// Manage → Joins: people asking to be put on Plex, from Discord (/join-plex) or by
// signing in with Plex. Invite sends the Plex invite; Deny asks first.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import type { AppAdminJoin } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Text } from "../../ui/Text";
import { since } from "../requests/stage";
import { AllClear, Heading, Initial, Pill, card } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";
import { radius } from "../../ui/theme";

export function useJoins(enabled = true) {
  const client = useApi();
  const key = useAdminKey();
  return useQuery({ queryKey: key("joins"), queryFn: ({ signal }) => client.adminJoins(signal), refetchInterval: 60_000, enabled });
}

export function JoinsSection() {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("joins");
  const joins = useJoins();
  const { isBusy, act } = useAct();

  if (!joins.data) {
    return joins.error ? (
      <>
        <Text variant="body">Couldn’t load join requests. {joins.error.message}</Text>
        <Button kind="secondary" label="Try again" onPress={() => void joins.refetch()} style={{ alignSelf: "flex-start" }} />
      </>
    ) : <View style={[card.box, { height: 150 }]} />;
  }
  const pending = joins.data.filter((j) => j.status === "pending");
  const earlier = joins.data.filter((j) => j.status !== "pending");

  const decide = async (j: AppAdminJoin, approve: boolean) => {
    const out = await act(j.key, () => client.decideJoin(j.messageId, approve), {
      done: (o) => ({ text: approve ? `Invited ${j.name}` : `Denied ${j.name}`, detail: o.message || undefined }), refresh: ["joins"],
    });
    if (out) qc.setQueryData<AppAdminJoin[]>(key, (d) => d?.map((x) => (x.key === j.key ? { ...x, status: approve ? "approved" : "denied" } : x)));
  };
  const confirmDeny = (j: AppAdminJoin) =>
    confirm(`Deny ${j.name}?`, "They’re told they won’t be added to Plex.", [
      { text: "Keep it", style: "cancel" },
      { text: "Deny", style: "destructive", onPress: () => void decide(j, false) },
    ]);

  return (
    <>
      <Heading title="Waiting to join" count={pending.length} />
      {pending.length ? pending.map((j) => (
        <Animated.View key={j.key} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(220)} style={[card.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <View style={card.top}>
            <Initial name={j.name} />
            <View style={card.body}>
              <Text variant="eyebrow">{j.via === "plex" ? "Signed in with Plex" : "From Discord"} · asked {since(j.askedAt)}</Text>
              <Text variant="title">{j.name}</Text>
              <Text variant="meta">{j.email || "Email on their Plex account"}</Text>
            </View>
          </View>
          {j.messageId ? (
            <View style={card.actions}>
              <Button label="Invite to Plex" busy={isBusy(j.key)} busyLabel="Inviting…" onPress={() => void decide(j, true)} style={card.grow}
                accessibilityLabel={`Invite ${j.name} to Plex`} />
              <Button kind="danger" label="Deny" disabled={isBusy(j.key)} onPress={() => confirmDeny(j)} style={card.grow}
                accessibilityLabel={`Deny ${j.name}`} />
            </View>
          ) : <Text variant="meta">Answer this one in Discord.</Text>}
        </Animated.View>
      )) : <AllClear title="Nobody waiting">When someone asks to join, from Discord or by signing in with Plex, they land here.</AllClear>}

      {earlier.length ? (
        <>
          <Heading title="Earlier" />
          {earlier.map((j) => (
            <View key={j.key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pill label={j.status === "denied" ? "Denied" : j.status.charAt(0).toUpperCase() + j.status.slice(1)} tone={j.status === "denied" ? "plain" : "ok"} />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{j.name}</Text>
                <Text variant="meta" numberOfLines={1}>{[j.email, since(j.askedAt)].filter(Boolean).join(" · ")}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}
