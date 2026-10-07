// What stands in for a screen or section until its query has data: a placeholder while it
// loads, "You're offline" while the load waits for a connection (it starts by itself once
// the phone is back online), or what went wrong with Try again.
import type { FetchStatus } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { color, radius, space } from "./theme";

/**
 * `errorTitle` heads a failed load ("Couldn’t load people."). The placeholder is a panel
 * `height` tall, or the screen's own `skeleton`; either way a screen reader hears "Loading".
 */
export function QueryGate({ query, errorTitle, height = 160, skeleton }: {
  query: { error: Error | null; fetchStatus: FetchStatus; isFetching: boolean; refetch: () => unknown };
  errorTitle: string;
  height?: number;
  skeleton?: ReactNode;
}) {
  if (query.fetchStatus === "paused") return <OfflineNote />;
  if (query.error) {
    return (
      <View style={styles.message}>
        <Text variant="title" accessibilityRole="alert">{errorTitle}</Text>
        <Text variant="body">{query.error.message}</Text>
        <Button kind="secondary" label="Try again" busy={query.isFetching} busyLabel="Loading…" onPress={() => void query.refetch()} style={styles.start} />
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {skeleton ?? <View style={[styles.skeleton, { height }]} />}
    </View>
  );
}

/** Nothing loaded yet and no connection: it loads by itself once there is one. */
export function OfflineNote() {
  return (
    <View style={styles.message}>
      <Text variant="title" accessibilityRole="alert">You’re offline.</Text>
      <Text variant="body">This loads when you’re back online.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: space.s, paddingVertical: space.l },
  start: { alignSelf: "flex-start" },
  skeleton: { borderRadius: radius.m, backgroundColor: color.panel },
});
