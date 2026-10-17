// Manage, for admins: the desk, as the website's. Under the title, what needs you in a line,
// five monitors (tap one to show only its part of the queue), and the queue: Needs you,
// Waiting on them, or Done, each row with its two keys and a detail sheet. The full views
// (every section the website's Manage has) are under "Everything else", a drawer that
// slides in beside the title and pushes the page aside; an alert or a link opens one
// straight away (/manage?tab=…&who=…), and "‹ Desk" goes back. An alert about one thing (a
// ticket, a request, a blocked import) opens the desk with its detail sheet: /manage?item=<its key>.
// Anyone else who reaches it (an alert from when they were an admin, a link) is told it's
// for admins, and nothing is asked of the bot.
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
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
import { CleanupSection } from "./CleanupSection";
import { DiscordSection } from "./DiscordSection";
import { HealthSection } from "./HealthSection";
import { InvitesSection } from "./InvitesSection";
import { MessagesSection } from "./MessagesSection";
import { JoinsSection } from "./JoinsSection";
import { PeopleSection } from "./PeopleSection";
import { RequestsSection } from "./RequestsSection";
import { SectionsDrawer } from "./SectionsDrawer";
import { AllRequestsSection } from "./AllRequestsSection";
import { TicketsSection } from "./TicketsSection";
import { Ambient, GlassFill, glass, TAB_BAR_CLEARANCE } from "../../ui/Glass";
import { useMe } from "../me/useMe";
import { Placeholder } from "../../ui/Placeholder";
import { DetailSheet } from "./desk/Detail";
import { DeskView, WIDE } from "./desk/DeskView";
import { EverythingElse } from "./desk/EverythingElse";
import { menuGroups } from "./desk/manageMenu";
import type { Area, View as Shown } from "./desk/manageQueue";
import { useDesk } from "./desk/useDesk";
import { useDeskActions } from "./desk/useDeskActions";

type Tab = "requests" | "tickets" | "all" | "joins" | "people" | "invites" | "cleanup" | "messages" | "health" | "discord";
const TAB_LABEL: Record<Tab, string> = {
  tickets: "Tickets", requests: "Requests", all: "All requests", joins: "Join requests", invites: "Invites", people: "People",
  cleanup: "Cleanup", discord: "Discord", messages: "Messages", health: "Health",
};
const TAB_IDS = Object.keys(TAB_LABEL) as Tab[];
/** The menu's rows by the website's `?tab=`: its Sign-ins live in Health here. */
const tabOf = (tab: string): Tab | null => (tab === "security" ? "health" : TAB_IDS.includes(tab as Tab) ? (tab as Tab) : null);

export function ManageScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const server = useServer();
  // An alert can open a full view (and, for a DM, the conversation): /manage?tab=messages&who=d123.
  const params = useLocalSearchParams<{ tab?: string; who?: string; item?: string }>();
  /** The full view shown, or null for the desk. */
  const [tab, setTab] = useState<Tab | null>(null);
  const [who, setWho] = useState<string | undefined>(undefined);
  const closeConversation = useCallback(() => setWho(undefined), []);
  const toTop = () => end.scroll.current?.scrollTo({ y: 0, animated: false });
  // The Everything else drawer; another tab, and back, finds Manage without it.
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  useFocusEffect(useCallback(() => closeMenu, [closeMenu]));
  // The desk's own state: which list, which monitor narrows it, and the item open in its sheet.
  const [view, setView] = useState<Shown>("needs");
  const [filter, setFilter] = useState<Area | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeSheet = useCallback(() => setOpenKey(null), []);
  /** A full view from its top (with the conversation `who`, for Messages), the drawer and the sheet gone. */
  const full = (t: Tab, person?: string) => { setTab(t); setWho(person); setOpenKey(null); closeMenu(); toTop(); };
  useEffect(() => {
    const t = params.tab ? tabOf(params.tab) : null;
    if (t) { setTab(t); setWho(undefined); toTop(); }
    if (params.who) setWho(params.who);
    // One thing: the desk, on the list it's in, with its sheet open (once the desk has it).
    if (params.item) { setTab(null); setWho(undefined); setFilter(null); setView(params.item.startsWith("done-") ? "done" : "needs"); toTop(); }
    // Used up: the next alert with the same address changes them again, with the drawer gone.
    if (params.tab || params.who || params.item) {
      router.setParams({ tab: undefined, who: undefined, item: undefined });
      closeMenu();
      setOpenKey(params.item ?? null);
    }
  }, [params.tab, params.who, params.item]);
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
  const { desk, data } = useDesk(admin);
  const a = useDeskActions();
  const wide = useWindowDimensions().width >= WIDE;
  const groups = menuGroups(desk, data);
  const items = [...desk.needs, ...desk.waiting, ...desk.done];
  // A thing an alert named may be done by now: then its Done row's sheet.
  const opened = openKey ? items.find((i) => i.key === openKey) ?? items.find((i) => i.key === `done-${openKey}`) ?? null : null;
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    // Not (yet) an admin: ask again who this is, in case that has changed or the last try failed.
    try { await qc.refetchQueries({ queryKey: admin ? ["admin", server] : ["session", server] }); } finally { setPulling(false); }
  }, [qc, server, admin]);
  // Something waits in the menu that the desk doesn't show (a new invite link): a dot on its button.
  const dot = freshLinks.length > 0;

  // Not an admin, or not known yet: why there's nothing here, or that it's on its way (or
  // waiting to be online, or couldn't be asked).
  const gate = admin ? null : me.data ? (
    <>
      <Text variant="body">This page is for admins.</Text>
      <Button kind="secondary" label="Go to Home" onPress={() => router.navigate("/home")} style={styles.home} />
    </>
  ) : <QueryGate query={me} errorTitle="Couldn’t load Manage." skeleton={<Placeholder height={220} />} />;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <SectionsDrawer open={menu && !gate} onClose={closeMenu} title="Everything else"
        panel={<EverythingElse groups={groups} onPick={(row) => { const t = tabOf(row.tab); if (t) full(t); }} />}>
        <ScrollView
          ref={end.scroll}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
        >
          <View style={styles.head}>
            <View style={styles.title}><ScreenTitle>Manage</ScreenTitle></View>
            {gate ? null : (
              <PressableScale onPress={() => setMenu(true)} style={[styles.menu, glass.surface]} accessibilityHint="Opens every full view"
                accessibilityLabel={dot ? "Everything else, a new invite link" : "Everything else"}>
                <GlassFill radius={TOUCH / 2} interactive />
                {[0, 1, 2].map((i) => <View key={i} style={styles.bar} />)}
                {dot ? <View testID="sections-dot" style={styles.dot} /> : null}
              </PressableScale>
            )}
          </View>
          {gate ?? (tab ? (
            <>
              <Button kind="quiet" label="‹ Desk" onPress={() => { setTab(null); setWho(undefined); toTop(); }} style={styles.back} accessibilityLabel="Back to the desk" haptic="none" />
              <Text variant="title" accessibilityRole="header">{TAB_LABEL[tab]}</Text>
              <Text variant="body">Deciding here is the same as the buttons in Discord.</Text>
              <View style={styles.section}>
                {tab === "tickets" ? <TicketsSection /> : tab === "requests" ? <RequestsSection /> : tab === "all" ? <AllRequestsSection /> : tab === "joins" ? <JoinsSection /> : tab === "people" ? <PeopleSection />
                  : tab === "invites" ? <InvitesSection fresh={freshLinks} onMade={holdLink} onDone={dropLink} /> : tab === "cleanup" ? <CleanupSection onFieldFocus={end.onFocus} /> : tab === "messages" ? <MessagesSection key={who ?? "all"} who={who} onClose={closeConversation} onComposerFocus={end.onFocus} />
                  : tab === "health" ? <HealthSection /> : <DiscordSection />}
              </View>
            </>
          ) : (
            <DeskView desk={desk} a={a} me={me.data?.user.name ?? null} full={(t, person) => { const x = tabOf(t); if (x) full(x, person); }}
              view={view} onView={(v) => { setView(v); if (v !== "needs") setFilter(null); }} filter={filter} onFilter={setFilter}
              selected={openKey} onOpen={(item) => setOpenKey(item.key)} />
          ))}
        </ScrollView>
        {/* With the page, under the drawer: the fade never lies over the drawer's top. */}
        <StatusBarScrim />
      </SectionsDrawer>
      {!wide && opened && !tab && !gate ? (
        <DetailSheet item={opened} a={a} onClose={closeSheet} full={(t, person) => { const x = tabOf(t); if (x) full(x, person); }} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.l },
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
  back: { alignSelf: "flex-start" },
  home: { alignSelf: "flex-start", marginTop: space.s },
});
