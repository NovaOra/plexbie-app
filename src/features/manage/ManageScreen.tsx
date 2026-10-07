// Manage, for admins: everything the website's Manage page does. A menu button beside the
// title slides in a drawer of the sections and what's waiting in each, pushing the page
// aside (a dot on the button when something waits in another one); under the title, the
// section shown and what's waiting in it, then that section.
// Anyone else who reaches it (an alert from when they were an admin, a link) is told it's
// for admins, and none of its sections is asked for.
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { KEYBOARD_BEHAVIOR, useScrollToEnd } from "../../ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppNewInvite } from "../../api/schemas";
import { useServer } from "../../auth/session";
import { Button } from "../../ui/Button";
import { QueryGate } from "../../ui/QueryGate";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, radius, space, TOUCH } from "../../ui/theme";
import { CleanupSection, useCleanup } from "./CleanupSection";
import { DiscordSection } from "./DiscordSection";
import { HealthSection, useHealth } from "./HealthSection";
import { InvitesSection } from "./InvitesSection";
import { MessagesSection, useMessagePeople } from "./MessagesSection";
import { JoinsSection, useJoins } from "./JoinsSection";
import { PeopleSection } from "./PeopleSection";
import { RequestsSection, useRequestsCount } from "./RequestsSection";
import { SectionsDrawer } from "./SectionsDrawer";
import { AllRequestsSection, useAllRequests } from "./AllRequestsSection";
import { TicketsSection, useTickets } from "./TicketsSection";
import { Ambient, GlassFill, glass, TAB_BAR_CLEARANCE } from "../../ui/Glass";
import { useMe } from "../me/useMe";
import { card } from "./bits";

type Tab = "requests" | "tickets" | "all" | "joins" | "people" | "invites" | "cleanup" | "messages" | "health" | "discord";
const TAB_IDS: Tab[] = ["requests", "tickets", "all", "joins", "people", "invites", "cleanup", "messages", "health", "discord"];

export function ManageScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const server = useServer();
  // An alert can open a section (and, for a DM, the conversation): /manage?tab=messages&who=d123.
  const params = useLocalSearchParams<{ tab?: string; who?: string }>();
  const [tab, setTab] = useState<Tab>("requests");
  const [who, setWho] = useState<string | undefined>(undefined);
  /** Another section: an alert's conversation is done with, so Messages opens on everyone. */
  const pick = (t: Tab) => { setTab(t); setWho(undefined); };
  /** The conversation closed: Messages opens on everyone next time. */
  const closeConversation = useCallback(() => setWho(undefined), []);
  const toTop = () => end.scroll.current?.scrollTo({ y: 0, animated: false });
  // The drawer of sections; another tab, and back, finds Manage without it.
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  useFocusEffect(useCallback(() => closeMenu, [closeMenu]));
  /** Chosen from the menu: the section from its top (the one shown, too, keeping its conversation), the drawer gone. */
  const choose = (t: Tab) => { if (t !== tab) pick(t); toTop(); closeMenu(); };
  useEffect(() => {
    if (params.tab && TAB_IDS.includes(params.tab as Tab)) { setTab(params.tab as Tab); setWho(undefined); toTop(); }
    if (params.who) setWho(params.who);
    // Used up: the next alert with the same address changes them again, and opens its section,
    // with the drawer gone (it may have been open when the alert was tapped).
    if (params.tab || params.who) { router.setParams({ tab: undefined, who: undefined }); closeMenu(); }
  }, [params.tab, params.who]);
  // New invite links are shown only once: held here until dismissed, so leaving Invites
  // (even while one is being made) doesn't lose them. Only this server's.
  const [fresh, setFresh] = useState<{ server: string; links: AppNewInvite[] }>({ server, links: [] });
  const freshLinks = fresh.server === server ? fresh.links : [];
  const holdLink = (made: AppNewInvite) => setFresh((f) => ({ server, links: [made, ...(f.server === server ? f.links : [])] }));
  const dropLink = (id: string) => setFresh((f) => ({ ...f, links: f.links.filter((m) => m.invite.id !== id) }));
  const end = useScrollToEnd();
  // Nothing is asked for until the bot has said this is an admin: for anyone else each would be refused.
  const me = useMe();
  const admin = !!me.data?.admin;
  const newMessages = useMessagePeople(admin).data?.filter((p) => p.unread > 0).length ?? 0;
  const { waiting } = useRequestsCount(admin);
  const joins = useJoins(admin);
  const joinsWaiting = joins.data?.filter((j) => j.status === "pending").length ?? 0;
  const stuck = useAllRequests(admin).data?.counts?.stuck ?? 0;
  const tickets = useTickets(admin).data?.counts.action ?? 0;
  const leaving = useCleanup(admin).data?.warning.length ?? 0;
  const down = useHealth(admin).data?.filter((h) => !h.ok).length ?? 0;
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    // Not (yet) an admin: ask again who this is, in case that has changed or the last try failed.
    try { await qc.refetchQueries({ queryKey: admin ? ["admin", server] : ["session", server] }); } finally { setPulling(false); }
  }, [qc, server, admin]);

  /** "Requests · 4 waiting" (or "All requests · 2 stuck", "Tickets · 1 open", "Health · 1 down"): the section, and what's waiting in it. */
  const word = (id: Tab) => (id === "all" ? "stuck" : id === "tickets" ? "open" : id === "messages" ? "new"
    : id === "health" ? "down" : id === "cleanup" ? "leaving" : "waiting");
  const sectionLabel = (id: Tab) => {
    const [, label, n] = tabs.find(([t]) => t === id)!;
    return n ? `${label} · ${n} ${word(id)}` : label;
  };
  const tabs: [Tab, string, number][] = [
    // The website's names and order.
    ["tickets", "Tickets", tickets], ["requests", "Requests", waiting], ["all", "All requests", stuck], ["joins", "Join requests", joinsWaiting], ["invites", "Invites", freshLinks.length], ["people", "People", 0],
    ["cleanup", "Cleanup", leaving], ["discord", "Discord", 0], ["messages", "Messages", newMessages], ["health", "Health", down],
  ];
  // What's waiting elsewhere, so it isn't hidden behind the menu: a dot on its button.
  const elsewhere = tabs.filter(([id, , n]) => id !== tab && n > 0).length;

  // Not an admin, or not known yet: why there's nothing here, or that it's on its way (or
  // waiting to be online, or couldn't be asked).
  const gate = admin ? null : me.data ? (
    <>
      <Text variant="body">This page is for admins.</Text>
      <Button kind="secondary" label="Go to Home" onPress={() => router.navigate("/home")} style={styles.home} />
    </>
  ) : <QueryGate query={me} errorTitle="Couldn’t load Manage." skeleton={<View style={[card.box, { height: 220 }]} />} />;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <SectionsDrawer open={menu && !gate} onClose={closeMenu} value={tab} onChoose={(v) => choose(v as Tab)}
        sections={tabs.map(([value, , n]) => ({ value, label: sectionLabel(value), hot: n > 0 }))}>
        <ScrollView
          ref={end.scroll}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
        >
          <View style={styles.head}>
            <View style={styles.title}><ScreenTitle>Manage</ScreenTitle></View>
            {gate ? null : (
              <PressableScale onPress={() => setMenu(true)} style={[styles.menu, glass.surface]} accessibilityHint="Opens the sections"
                accessibilityLabel={elsewhere ? `Sections, ${elsewhere} need${elsewhere === 1 ? "s" : ""} you` : "Sections"}>
                <GlassFill radius={TOUCH / 2} interactive />
                {[0, 1, 2].map((i) => <View key={i} style={styles.bar} />)}
                {elsewhere ? <View testID="sections-dot" style={styles.dot} /> : null}
              </PressableScale>
            )}
          </View>
          {gate ?? (
            <>
              <Text variant="title" accessibilityRole="header">{sectionLabel(tab)}</Text>
              <Text variant="body">Deciding here is the same as the buttons in Discord.</Text>
              <View style={styles.section}>
                {tab === "tickets" ? <TicketsSection /> : tab === "requests" ? <RequestsSection /> : tab === "all" ? <AllRequestsSection /> : tab === "joins" ? <JoinsSection /> : tab === "people" ? <PeopleSection />
                  : tab === "invites" ? <InvitesSection fresh={freshLinks} onMade={holdLink} onDone={dropLink} /> : tab === "cleanup" ? <CleanupSection onFieldFocus={end.onFocus} /> : tab === "messages" ? <MessagesSection key={who ?? "all"} who={who} onClose={closeConversation} onComposerFocus={end.onFocus} />
                  : tab === "health" ? <HealthSection /> : <DiscordSection />}
              </View>
            </>
          )}
        </ScrollView>
        {/* With the page, under the drawer: the fade never lies over the drawer's top. */}
        <StatusBarScrim />
      </SectionsDrawer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.s },
  head: { flexDirection: "row", alignItems: "center", gap: space.m },
  title: { flex: 1 },
  // A round glass button, the pill's colours on Android; three bars rather than a ☰ glyph,
  // which not every phone's font draws the same.
  menu: {
    width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center", gap: 4,
    borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.panel,
  },
  bar: { width: 18, height: 2, borderRadius: radius.pill, backgroundColor: color.ink },
  dot: {
    position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: 5,
    backgroundColor: color.screen, borderWidth: 1.5, borderColor: color.field,
  },
  section: { gap: space.m },
  home: { alignSelf: "flex-start", marginTop: space.s },
});
