// Home: the household's channel. What's on (live), what just arrived, where your requests
// are, the all-time board with streaks, and your own figures. The website's Home and
// Channel together: Android's tab bar has no room for a sixth tab.
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UpdateCard } from "../update/UpdateCard";
import { Board, YouFigures } from "../channel/ChannelSections";
import { Avatar } from "../me/Avatar";
import type { AppArrival, AppCommunity } from "../../api/schemas";
import { Button } from "../../ui/Button";
import { Poster } from "../../ui/Poster";
import { PressableScale } from "../../ui/Pressable";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { RequestCard } from "../requests/RequestCard";
import { since } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { useMe } from "../me/useMe";
import { OnAirList } from "./OnAirList";
import { useArrivals, useCommunity, useStatus } from "./useHome";
import { Ambient, GlassFill, glass, TAB_BAR_CLEARANCE } from "../../ui/Glass";

/** A title page exists for films and shows with a TMDB id; Plex-only items and shelf books have none. */
const openable = (t: AppArrival["title"]) => (t.kind === "movie" || t.kind === "tv") && /^\d+$/.test(t.id);

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const status = useStatus();
  const arrivals = useArrivals();
  const community = useCommunity();
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    try { await qc.refetchQueries({ predicate: (q) => ["status", "arrivals", "community", "requests", "watchparty"].includes(String(q.queryKey[0])) }); }
    finally { setPulling(false); }
  }, [qc]);

  const s = status.data;
  const films = s?.libraries.find((l) => l.kind === "movie")?.count;
  const shows = s?.libraries.find((l) => l.kind === "show")?.count;
  const strap = !s ? (status.error ? "Couldn’t reach Plexbie just now." : " ")
    : s.online ? [`${s.streams} watching`, films != null ? `${films.toLocaleString()} films` : null, shows != null ? `${shows.toLocaleString()} shows` : null]
      .filter(Boolean).join(" · ")
    : "Plex isn’t answering. Requests still go through.";
  const off = !!s && !s.online;

  return (
    <View style={styles.page}>
      <Ambient />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
      >
        <View style={styles.pad}>
          <View style={styles.top}>
            <View style={styles.onAir} accessible accessibilityRole="text" accessibilityLabel={`${off ? "Off air" : "On air"}. ${strap}`}>
              <View style={[styles.dot, off && styles.dotOff]} />
              <Text variant="eyebrow" style={[styles.onAirText, off && styles.offText]}>{off ? "Off air" : "On air"}</Text>
            </View>
            <YouButton />
          </View>
          <ScreenTitle>Plexbie</ScreenTitle>
          <Text variant="body">{strap}</Text>
        </View>

        <UpdateCard style={styles.pad} />
        <Arrivals arrivals={arrivals.data} failed={!!arrivals.error} retry={() => void arrivals.refetch()} />
        <YourRequests />
        {/* The channel, folded into Home: who's watching (live), the board and your figures. */}
        <OnAir community={community.data} failed={!!community.error} retry={() => void community.refetch()} />
        <View style={styles.pad}>
          <Text variant="eyebrow" accessibilityRole="header" style={styles.section}>Most watched</Text>
          <Board community={community.data} failed={!!community.error} retry={() => void community.refetch()} />
        </View>
        {community.data?.you ? (
          <View style={styles.pad}>
            <Text variant="eyebrow" accessibilityRole="header" style={styles.section}>You</Text>
            <YouFigures you={community.data.you} />
          </View>
        ) : null}
        {s?.libraries.length ? (
          <View style={styles.pad}>
            <Text variant="eyebrow" accessibilityRole="header" style={styles.section}>On the server</Text>
            <View style={styles.counts}>
              {s.libraries.map((l) => (
                <View key={l.title} style={[styles.count, glass.surface]}>
                  <GlassFill radius={radius.m} />
                  <Text style={styles.countValue} maxFontSizeMultiplier={1.6}>{l.count.toLocaleString()}</Text>
                  <Text variant="meta">{l.title}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

/** Your account (who, how signed in, sign out): an initial in a circle, top right. */
function YouButton() {
  const me = useMe();
  const name = me.data?.user.name ?? "";
  return (
    <PressableScale haptic="none" onPress={() => router.push("/you")} accessibilityLabel="You" accessibilityHint={name ? `Your account, ${name}` : "Your account"} style={styles.you}>
      <Avatar name={name} avatar={me.data?.user.avatar} size={48} />
    </PressableScale>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[styles.pad, styles.sectionHead]}>
      <Text variant="eyebrow" accessibilityRole="header">{title}</Text>
      {action && onAction ? (
        <PressableScale haptic="none" onPress={onAction} accessibilityRole="button" style={styles.link}>
          <Text variant="label" style={styles.linkText}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function Arrivals({ arrivals, failed, retry }: { arrivals?: AppArrival[]; failed: boolean; retry: () => void }) {
  // Wider columns as the system text grows, so titles wrap between words, not inside them.
  const { fontScale } = useWindowDimensions();
  const itemWidth = Math.round(112 * Math.min(Math.max(fontScale, 1), 1.8));
  if (failed && !arrivals) {
    return (
      <View style={styles.pad}>
        <SectionHead title="Just arrived" />
        <Text variant="body">Couldn’t get what’s new on Plex. Nothing is lost.</Text>
        <Button kind="secondary" label="Try again" onPress={retry} style={styles.start} />
      </View>
    );
  }
  if (arrivals && !arrivals.length) return null;
  return (
    <View>
      <SectionHead title="Just arrived" />
      <FlatList
        horizontal
        data={arrivals ?? []}
        keyExtractor={(a) => `${a.title.kind}:${a.title.id}:${a.addedAt}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        ListEmptyComponent={<View style={styles.row}>{[0, 1, 2].map((i) => <View key={i} style={[{ width: itemWidth }, styles.skeleton]} />)}</View>}
        renderItem={({ item: a }) => {
          const go = openable(a.title);
          const body = (
            <>
              <Poster poster={a.title.poster} title={a.title.title} id={a.title.id} />
              <Text variant="label" numberOfLines={2} style={styles.railTitle}>{a.title.title}</Text>
              <Text variant="meta" numberOfLines={1}>{a.detail || since(a.addedAt)}</Text>
            </>
          );
          return go ? (
            <PressableScale haptic="none" style={{ width: itemWidth }} accessibilityRole="button"
              accessibilityLabel={`${a.title.title}${a.detail ? `, ${a.detail}` : ""}, added ${since(a.addedAt)}`}
              onPress={() => router.push({ pathname: "/title/[kind]/[id]", params: { kind: a.title.kind, id: a.title.id } })}>
              {body}
            </PressableScale>
          ) : (
            <View style={{ width: itemWidth }} accessible accessibilityLabel={`${a.title.title}${a.detail ? `, ${a.detail}` : ""}, added ${since(a.addedAt)}`}>{body}</View>
          );
        }}
      />
    </View>
  );
}

function YourRequests() {
  const { data, error } = useRequests();
  const open = (slot: number) => router.push({ pathname: "/request/[slot]", params: { slot: String(slot) } });
  // What's still happening first, then the latest that arrived; never what was turned down.
  const rows = (data ?? []).filter((r) => r.stage !== "declined" && r.stage !== "closed").slice(0, 3);
  return (
    <View>
      <SectionHead title="Your requests" action="All requests" onAction={() => router.navigate("/requests")} />
      <View style={[styles.pad, styles.stack]}>
        {error && !data ? <Text variant="body">Couldn’t load your requests. They’re still there.</Text>
          : !data ? <View style={[styles.skeleton, { height: 132 }]} />
          : rows.length ? rows.map((r) => <RequestCard key={r.slot} request={r} onPress={open} />)
          : (
            <>
              <Text variant="body">Nothing requested yet.</Text>
              <Button kind="secondary" label="Find something" onPress={() => router.navigate("/search")} style={styles.start} />
            </>
          )}
      </View>
    </View>
  );
}

function OnAir({ community, failed, retry }: { community?: AppCommunity; failed: boolean; retry: () => void }) {
  return (
    <View>
      <SectionHead title="On air now" />
      <View style={[styles.pad, styles.stack]}>
        <OnAirList community={community} failed={failed} retry={retry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { gap: space.xl },
  pad: { paddingHorizontal: space.l, gap: space.s },
  start: { alignSelf: "flex-start" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  you: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.panelRaised, alignItems: "center", justifyContent: "center" },
  onAir: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.tally },
  dotOff: { backgroundColor: color.slate },
  onAirText: { color: color.tally },
  offText: { color: color.slateInk },
  section: { marginBottom: space.xs },
  // Wraps at large text sizes: the link drops under the heading instead of off the screen.
  sectionHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: space.m, marginBottom: space.s },
  link: { justifyContent: "center" },
  linkText: { color: color.screen, fontSize: 15 },
  rail: { paddingHorizontal: space.l, gap: space.m, flexDirection: "row" },
  row: { flexDirection: "row", gap: space.m },
  railTitle: { marginTop: space.s, fontSize: 14, lineHeight: 18 },
  skeleton: { backgroundColor: color.panel, borderRadius: radius.m, aspectRatio: undefined, height: 168 },
  stack: { gap: space.m },
  figures: { flexDirection: "row", gap: space.m },
  figure: { flex: 1, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, gap: 2 },
  figureValue: { fontFamily: font.black, fontSize: 28, lineHeight: 32, color: color.screen },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: space.m },
  count: { minWidth: 96, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  countValue: { fontFamily: font.bold, fontSize: 20, lineHeight: 24, color: color.ink },
});
