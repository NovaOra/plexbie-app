// Manage → Health: each service Plexbie talks to, and whether it answers, and signing out
// every other session.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import { StyleSheet, View } from "react-native";
import { ApiError } from "../../api/client";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { HoldButton } from "../../ui/HoldButton";
import { Text } from "../../ui/Text";
import { QueryGate } from "../../ui/QueryGate";
import { color, radius, space } from "../../ui/theme";
import { since } from "../requests/stage";
import { AllClear, Heading } from "./bits";
import { BlockedList } from "./BlockedImport";
import { useAct, useAdminKey } from "./useAdmin";

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
      {!rows ? <QueryGate query={health} errorTitle="Couldn’t check the services." height={180} />
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
      {/* Before the first check is in, the gate above has its own Try again. */}
      {rows ? (
        <Button kind="secondary" label="Check again" busy={health.isFetching} busyLabel="Checking…" onPress={() => void health.refetch()} style={{ alignSelf: "flex-start" }} />
      ) : null}
      <SignOutOthers />
    </>
  );
}

/** For a sign-in that wasn't an admin's own (the sign-in alerts name Manage → Health), every website
 *  and app sign-in but this one ends. The bot keeps this one, and this phone's alerts with it. */
function SignOutOthers() {
  const client = useApi();
  const { isBusy, act } = useAct();
  const go = async () => {
    let ended = 0;
    await act("sign-out", async () => {
      const done = await client.signOutOthers().catch((e: unknown) => {
        // A Plexbie from before this button has no such route: a bare 404 (or 405, as the website's
        // pages answer every other path), not one of the bot's own answers.
        if (e instanceof ApiError && (e.status === 404 || e.status === 405) && e.message === `The server said no (${e.status}).`) {
          throw new Error("This Plexbie can’t sign out other sessions from the app yet. Update it, then try again.");
        }
        throw e;
      });
      ended = done.ended;
      return done;
    }, {
      done: () => ({ text: "Signed out everywhere else",
        detail: `${ended === 1 ? "1 app sign-in" : `${ended} app sign-ins`} ended, and every other website sign-in, with the alerts they had on. You’re still signed in here.` }),
      failText: "Sign-out didn’t finish",
    });
  };
  return (
    <>
      <Heading title="Sign-ins" />
      <View style={styles.signOut}>
        <Text variant="label">Sign out every other session</Text>
        <Text variant="meta">For a sign-in that wasn’t you: every website and app sign-in ends except this one, alerts turned on elsewhere stop, and the rest of the household signs in again.</Text>
        <HoldButton label="Sign out others" ms={1400} disabled={isBusy("sign-out")} onConfirm={() => void go()}
          confirmText="Every website and app sign-in ends except this one." />
      </View>
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
  signOut: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
});
