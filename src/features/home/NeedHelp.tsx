// "Need help?" on Home: a ticket about anything that isn't one of the member's requests (a
// film or show's own page has one for that), and every ticket of theirs, open or solved in
// the last 30 days, to read and add to. A Plexbie from before members had tickets of their
// own (it answers 404) shows none of it.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { AppMyTicket } from "../../api/schemas";
import { Button } from "../../ui/Button";
import { GlassFill, glass } from "../../ui/Glass";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { since } from "../requests/stage";
import { TicketPill } from "../tickets/Thread";
import { aboutLine, myState, olderBot, useMyTickets } from "../tickets/mine";

export function NeedHelp() {
  const { data, error, refetch } = useMyTickets();
  // Until the first answer it isn't known whether this Plexbie takes tickets.
  if (olderBot(error) || (!data && !error)) return null;
  return (
    <View>
      <View style={[styles.pad, styles.head]}>
        <Text variant="eyebrow" accessibilityRole="header">Need help?</Text>
      </View>
      <View style={[styles.pad, styles.stack]}>
        <Text variant="body">Something wrong with Plex, or with something you didn’t request? Tell the admins.</Text>
        <Button kind="secondary" label="Open a ticket" onPress={() => router.push("/ticket/new")} style={styles.start} />
        {error && !data ? (
          <>
            <Text variant="body">Couldn’t load your tickets. They’re still there.</Text>
            <Button kind="secondary" label="Try again" onPress={() => void refetch()} style={styles.start} />
          </>
        ) : data?.length ? (
          <>
            <Text variant="eyebrow" accessibilityRole="header" style={styles.list}>Your tickets</Text>
            {data.map((t) => <Row key={t.id} t={t} />)}
          </>
        ) : null}
      </View>
    </View>
  );
}

function Row({ t }: { t: AppMyTicket }) {
  const state = myState(t);
  const about = aboutLine(t);
  const when = t.updatedAt ? since(t.updatedAt) : "";
  return (
    <PressableScale haptic="none" onPress={() => router.push({ pathname: "/ticket/[id]", params: { id: t.id } })}
      accessibilityRole="button" accessibilityLabel={`${about}. ${t.reason ? `${t.reason}. ` : ""}${state.label}${when ? `, updated ${when}` : ""}.`}
      accessibilityHint="Opens your ticket">
      <View style={[styles.card, glass.surface, state.tone === "hot" && styles.hot]}>
        <GlassFill radius={radius.m} />
        <Text variant="title" numberOfLines={2}>{about}</Text>
        {t.reason ? <Text variant="meta" numberOfLines={2}>{t.reason}</Text> : null}
        <View style={styles.state}>
          <TicketPill label={state.label} tone={state.tone} />
          {when ? <Text variant="meta">{when}</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.l, gap: space.s },
  // As Home's other section heads.
  head: { marginBottom: space.s },
  stack: { gap: space.m },
  start: { alignSelf: "flex-start" },
  list: { marginTop: space.s },
  card: { gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  hot: { borderColor: "rgba(255, 92, 147, 0.6)" },          // as a ticket needing an admin on Manage
  state: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s, marginTop: space.xs },
});
