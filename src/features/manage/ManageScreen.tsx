// Manage, for admins: everything the website's Manage page does. A section dropdown (like
// the Request and Library pages' pickers) that says what's waiting, then that section.
// Anyone else who reaches it (an alert from when they were an admin, a link) is told it's
// for admins, and none of its sections is asked for.
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { KEYBOARD_BEHAVIOR, useScrollToEnd } from "../../ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppNewInvite } from "../../api/schemas";
import { useSession } from "../../auth/session";
import { Button } from "../../ui/Button";
import { PickerPill } from "../../ui/PickerSheet";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, space, TOUCH } from "../../ui/theme";
import { CleanupSection, useCleanup } from "./CleanupSection";
import { DiscordSection } from "./DiscordSection";
import { HealthSection, useHealth } from "./HealthSection";
import { InvitesSection } from "./InvitesSection";
import { MessagesSection, useMessagePeople } from "./MessagesSection";
import { JoinsSection, useJoins } from "./JoinsSection";
import { PeopleSection } from "./PeopleSection";
import { RequestsSection, useRequestsCount } from "./RequestsSection";
import { AllRequestsSection, useAllRequests } from "./AllRequestsSection";
import { TicketsSection, useTickets } from "./TicketsSection";
import { Ambient, TAB_BAR_CLEARANCE } from "../../ui/Glass";
import { useMe } from "../me/useMe";
import { card } from "./bits";

type Tab = "requests" | "tickets" | "all" | "joins" | "people" | "invites" | "cleanup" | "messages" | "health" | "discord";
const TAB_IDS: Tab[] = ["requests", "tickets", "all", "joins", "people", "invites", "cleanup", "messages", "health", "discord"];

export function ManageScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  // An alert can open a section (and, for a DM, the conversation): /manage?tab=messages&who=d123.
  const params = useLocalSearchParams<{ tab?: string; who?: string }>();
  const [tab, setTab] = useState<Tab>("requests");
  const [who, setWho] = useState<string | undefined>(undefined);
  /** Another section: an alert's conversation is done with, so Messages opens on everyone. */
  const pick = (t: Tab) => { setTab(t); setWho(undefined); };
  useEffect(() => {
    if (params.tab && TAB_IDS.includes(params.tab as Tab)) { setTab(params.tab as Tab); setWho(undefined); }
    if (params.who) setWho(params.who);
    // Used up: the next alert with the same address changes them again, and opens its section.
    if (params.tab || params.who) router.setParams({ tab: undefined, who: undefined });
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

  // Not an admin, or not known yet: why there's nothing here, or that it's on its way.
  const gate = admin ? null : me.data ? (
    <>
      <Text variant="body">This page is for admins.</Text>
      <Button kind="secondary" label="Go to Home" onPress={() => router.navigate("/home")} style={styles.home} />
    </>
  ) : me.error ? <Text variant="body">{me.error.message}</Text>
    : <View style={[card.box, { height: 220 }]} accessibilityLabel="Loading" accessible />;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView
        ref={end.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
      >
        <ScreenTitle>Manage</ScreenTitle>
        {gate ?? (
          <>
            <Text variant="body">Deciding here is the same as the buttons in Discord.</Text>
            <View style={styles.picker}>
              <PickerPill title="Section" label={sectionLabel(tab)} value={tab}
                options={tabs.map(([value]) => ({ value, label: sectionLabel(value) }))} onChange={(v) => pick(v as Tab)} />
              {/* What's waiting elsewhere, so it isn't hidden behind the dropdown. */}
              {tabs.filter(([id, , n]) => id !== tab && n > 0).map(([id, label, n]) => (
                <Text key={id} variant="meta" style={styles.waiting} onPress={() => pick(id)} accessibilityRole="button"
                  accessibilityLabel={`${label}, ${n} ${word(id)}. Opens it.`}>{label} · {n} {word(id)}</Text>
              ))}
            </View>
            <View style={styles.section}>
              {tab === "tickets" ? <TicketsSection /> : tab === "requests" ? <RequestsSection /> : tab === "all" ? <AllRequestsSection /> : tab === "joins" ? <JoinsSection /> : tab === "people" ? <PeopleSection />
                : tab === "invites" ? <InvitesSection fresh={freshLinks} onMade={holdLink} onDone={dropLink} /> : tab === "cleanup" ? <CleanupSection onFieldFocus={end.onFocus} /> : tab === "messages" ? <MessagesSection key={who ?? "all"} who={who} onClose={() => setWho(undefined)} onComposerFocus={end.onFocus} />
                : tab === "health" ? <HealthSection /> : <DiscordSection />}
            </View>
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.s },
  picker: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.m, paddingVertical: space.s },
  waiting: { color: color.screen, minHeight: TOUCH, textAlignVertical: "center", lineHeight: TOUCH },
  section: { gap: space.m },
  home: { alignSelf: "flex-start", marginTop: space.s },
});
