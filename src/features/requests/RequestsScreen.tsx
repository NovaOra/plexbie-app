import { useNetInfo } from "@react-native-community/netinfo";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRequest } from "../../api/schemas";
import { useSession } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { PressableScale } from "../../ui/Pressable";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { RequestCard } from "./RequestCard";
import { since, isOpen } from "./stage";
import { useRequests } from "./useRequests";
import { Ambient, TAB_BAR_CLEARANCE } from "../../ui/Glass";

// A word joiner after the slash: the command never breaks across two lines.
const SLASH_REQUEST = "/\u2060request";

export function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const { state } = useSession();
  const net = useNetInfo();
  const { data, error, isPending, fetchStatus, refetch, dataUpdatedAt } = useRequests();
  // The spinner is for a pull, not for the background poll every 10 s.
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => { setPulling(true); try { await refetch(); } finally { setPulling(false); } }, [refetch]);

  // Grouped as the website's My requests: what's still coming, then the latest few that
  // arrived or weren't added (the rest folded). Requests closed with the old backlog
  // aren't shown at all; they were never going to arrive.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => {
    const all = data ?? [];
    const groups = [
      { key: "open", title: "On the schedule", rows: all.filter((r) => isOpen(r.stage) && r.stage !== "upcoming"), fold: Infinity },
      // Not out yet: soonest first, those with no date at the end.
      { key: "upcoming", title: "Coming soon", fold: Infinity,
        rows: all.filter((r) => r.stage === "upcoming")
          .sort((a, b) => (a.progress?.releaseDate ?? "9999").localeCompare(b.progress?.releaseDate ?? "9999")) },
      { key: "arrived", title: "Arrived", rows: all.filter((r) => r.stage === "available"), fold: FOLD },
      { key: "declined", title: "Not added", rows: all.filter((r) => r.stage === "declined"), fold: FOLD },
    ];
    return groups.filter((g) => g.rows.length).map((g) => {
      const shown = unfolded.has(g.key) ? g.rows : g.rows.slice(0, g.fold);
      return { key: g.key, title: g.title, data: shown, hidden: g.rows.length - shown.length };
    });
  }, [data, unfolded]);
  const unfold = useCallback((key: string) => setUnfolded((s) => new Set(s).add(key)), []);

  const open = useCallback((slot: number) => router.push({ pathname: "/request/[slot]", params: { slot: String(slot) } }), []);
  const renderItem = useCallback(({ item }: { item: AppRequest }) => <RequestCard request={item} onPress={open} />, [open]);
  const offline = net.isConnected === false;
  useAnnounce(offline && data ? "Offline. Showing what Plexbie said last." : null);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.l }]}>
      <View style={styles.onAir} accessibilityLabel={state.phase === "signedIn" && state.sample ? "Sample household" : "On air"}>
        <View style={styles.onAirDot} />
        <Text variant="eyebrow" style={styles.onAirText}>{state.phase === "signedIn" && state.sample ? "Sample household" : "On air"}</Text>
      </View>
      <ScreenTitle>My requests</ScreenTitle>
      <Text variant="body">Everything you’ve asked for, from here or with {SLASH_REQUEST} in Discord.</Text>
      {offline && data ? (
        <Text variant="meta" style={styles.offline} accessibilityRole="alert">
          Offline. Showing what Plexbie said {since(new Date(dataUpdatedAt).toISOString())}.
        </Text>
      ) : null}
    </View>
  );

  if (isPending && fetchStatus === "paused") {
    return (
      <View style={[styles.page, styles.pad]}>
        {header}
        <View style={styles.message}>
          <Text variant="title" accessibilityRole="alert">You’re offline.</Text>
          <Text variant="body">Your requests will load when you’re back online.</Text>
        </View>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.page, styles.pad]}>
        {header}
        <View accessibilityLabel="Loading your requests" accessible>
          {[0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
        </View>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.page, styles.pad]}>
        {header}
        <View style={styles.message}>
          <Text variant="title" accessibilityRole="alert">Couldn’t load your requests.</Text>
          <Text variant="body">{offline ? "You’re offline. They’re still there." : error.message}</Text>
          <PressableScale onPress={() => refetch()} style={styles.button} accessibilityLabel="Try again">
            <Text variant="label" style={styles.buttonText}>Try again</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Ambient />
    <SectionList
      style={styles.page}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
      sections={sections}
      keyExtractor={(r) => String(r.slot)}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => <Text variant="eyebrow" style={styles.section} accessibilityRole="header">{section.title}</Text>}
      renderSectionFooter={({ section }) => section.hidden > 0 ? (
        <PressableScale onPress={() => unfold(section.key)} style={styles.more} accessibilityLabel={`Show ${section.hidden} more ${section.title.toLowerCase()}`}>
          <Text variant="label" style={styles.moreText}>Show {section.hidden} more</Text>
        </PressableScale>
      ) : null}
      ItemSeparatorComponent={Separator}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.message}>
          <Text variant="title">{data?.length ? "Nothing on the schedule." : "Nothing requested yet."}</Text>
          <Text variant="body">Find a film, show or book and ask for it. It shows up here.</Text>
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />
      }
      initialNumToRender={8}
      windowSize={7}
    />
    <StatusBarScrim />
    </View>
  );
}

const Separator = () => <View style={{ height: space.m }} />;
/** Arrived and Not added show this many before "Show N more", as on the website. */
const FOLD = 5;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  header: { gap: space.s, paddingBottom: space.l },
  list: { paddingHorizontal: space.l },
  pad: { paddingHorizontal: space.l },
  onAir: { flexDirection: "row", alignItems: "center", gap: 6 },
  onAirDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.tally },
  onAirText: { color: color.tally },
  offline: { marginTop: space.xs, color: color.screen },
  section: { marginTop: space.l, marginBottom: space.m },
  skeleton: { height: 132, borderRadius: radius.m, backgroundColor: color.panel, marginBottom: space.m },
  message: { gap: space.s, paddingVertical: space.xl },
  button: {
    alignSelf: "flex-start", marginTop: space.s, paddingHorizontal: space.xl, borderRadius: radius.pill,
    backgroundColor: color.screen, justifyContent: "center",
  },
  buttonText: { color: color.onScreen },
  more: {
    alignSelf: "flex-start", marginTop: space.m, paddingHorizontal: space.xl, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: color.screen, justifyContent: "center",
  },
  moreText: { color: color.screen },
});
