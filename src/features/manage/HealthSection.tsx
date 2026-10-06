// Manage → Health: each service Plexbie talks to, and whether it answers.
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { AllClear, Heading, card } from "./bits";
import { BlockedList } from "./BlockedImport";
import { useAdminKey } from "./useAdmin";

export function HealthSection() {
  const client = useApi();
  const health = useQuery({ queryKey: useAdminKey()("health"), queryFn: ({ signal }) => client.adminHealth(signal), refetchInterval: 60_000 });
  const rows = health.data;
  return (
    <>
      <BlockedList />
      <Heading title="Services" />
      {!rows ? (health.error ? <Text variant="body">{health.error.message}</Text> : <View style={[card.box, { height: 180 }]} />)
        : !rows.length ? <AllClear title="Nothing to check yet">Connect Sonarr, Radarr, Seerr, Tautulli or SABnzbd on the setup page and they’re watched here.</AllClear>
        : rows.map((h) => (
          <View key={h.name} style={[styles.item, !h.ok && styles.down]} accessible
            accessibilityLabel={`${h.name}: ${h.ok ? `answering in ${h.ms} milliseconds` : h.detail ?? "not answering"}`}>
            <View style={[styles.dot, h.ok ? styles.ok : styles.bad]} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="label">{h.name}</Text>
              <Text variant="meta" style={!h.ok ? styles.badText : undefined}>{h.ok ? `Answering in ${h.ms} ms` : h.detail ?? "Not answering"}</Text>
              {h.ok ? <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0.04, h.ms / 600)) * 100)}%` }]} /></View> : null}
            </View>
          </View>
        ))}
      <Button kind="secondary" label="Check again" busy={health.isFetching} busyLabel="Checking…" onPress={() => void health.refetch()} style={{ alignSelf: "flex-start" }} />
    </>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  down: { borderWidth: 1, borderColor: color.tally },
  dot: { width: 10, height: 10, borderRadius: 5 },
  ok: { backgroundColor: color.screen },
  bad: { backgroundColor: color.tally },
  badText: { color: color.tally },
  track: { height: 4, borderRadius: 2, backgroundColor: color.rule, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: color.slate },
});
