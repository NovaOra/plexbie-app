// Manage → Health: each service Plexbie talks to, and whether it answers.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import { StyleSheet, View } from "react-native";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { since } from "../requests/stage";
import { AllClear, Heading, card } from "./bits";
import { BlockedList } from "./BlockedImport";
import { useAdminKey } from "./useAdmin";

/** The services, asked again every minute: Health, and the "N down" beside Manage's section picker. */
export function useHealth(enabled = true) {
  const client = useApi();
  return useQuery({ queryKey: useAdminKey()("health"), queryFn: ({ signal }) => client.adminHealth(signal), refetchInterval: 60_000, enabled });
}

export function HealthSection() {
  const health = useHealth();
  const rows = health.data;
  // The last check failed (or is waiting for a connection) over rows already on screen: say
  // so, and how old they are, rather than leave "Answering" rows looking current.
  const stale = !!rows && (health.isError || health.isPaused);
  // Nothing re-renders the section while a check waits offline, so tick the age along.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!stale) return;
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [stale]);
  const checked = since(new Date(health.dataUpdatedAt).toISOString());
  return (
    <>
      <BlockedList />
      <Heading title="Services" />
      {stale ? (
        <Text variant="meta" style={styles.badText} accessibilityRole="alert">
          {health.isPaused ? "Offline" : "Couldn’t check"}. Last checked {checked}.
        </Text>
      ) : null}
      {!rows ? (health.error ? <Text variant="body">{health.error.message}</Text> : <View style={[card.box, { height: 180 }]} />)
        : !rows.length ? <AllClear title="Nothing to check yet">Connect Sonarr, Radarr, Seerr, Tautulli or SABnzbd on the setup page and they’re watched here.</AllClear>
        : rows.map((h) => (
          <View key={h.name} style={[styles.item, !h.ok && styles.down, stale && styles.stale]} accessible
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
  stale: { opacity: 0.6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  ok: { backgroundColor: color.screen },
  bad: { backgroundColor: color.tally },
  badText: { color: color.tally },
  track: { height: 4, borderRadius: 2, backgroundColor: color.rule, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: color.slate },
});
