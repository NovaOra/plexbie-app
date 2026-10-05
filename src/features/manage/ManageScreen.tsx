// Manage, for admins: everything the website's Manage page does. A section dropdown (like
// the Request and Library pages' pickers) that says what's waiting, then that section.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../auth/session";
import { PickerPill } from "../../ui/PickerSheet";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, space } from "../../ui/theme";
import { CleanupSection } from "./CleanupSection";
import { DiscordSection } from "./DiscordSection";
import { HealthSection } from "./HealthSection";
import { InvitesSection } from "./InvitesSection";
import { MessagesSection } from "./MessagesSection";
import { JoinsSection, useJoins } from "./JoinsSection";
import { PeopleSection } from "./PeopleSection";
import { RequestsSection, useRequestsCount } from "./RequestsSection";
import { AllRequestsSection, useAllRequests } from "./AllRequestsSection";
import { Ambient, TAB_BAR_CLEARANCE } from "../../ui/Glass";

type Tab = "requests" | "all" | "joins" | "people" | "invites" | "cleanup" | "messages" | "health" | "discord";

export function ManageScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  const [tab, setTab] = useState<Tab>("requests");
  const { waiting } = useRequestsCount();
  const joins = useJoins();
  const joinsWaiting = joins.data?.filter((j) => j.status === "pending").length ?? 0;
  const stuck = useAllRequests().data?.counts?.stuck ?? 0;
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    try { await qc.refetchQueries({ queryKey: ["admin", server] }); } finally { setPulling(false); }
  }, [qc, server]);

  /** "Requests · 4 waiting" (or "All requests · 2 stuck"): the section, and what's waiting in it. */
  const word = (id: Tab) => (id === "all" ? "stuck" : "waiting");
  const sectionLabel = (id: Tab) => {
    const [, label, n] = tabs.find(([t]) => t === id)!;
    return n ? `${label} · ${n} ${word(id)}` : label;
  };
  const tabs: [Tab, string, number][] = [
    // The website's names and order.
    ["requests", "Requests", waiting], ["all", "All requests", stuck], ["joins", "Join requests", joinsWaiting], ["invites", "Invites", 0], ["people", "People", 0],
    ["cleanup", "Cleanup", 0], ["discord", "Discord", 0], ["messages", "Messages", 0], ["health", "Health", 0],
  ];

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Ambient />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
      >
        <ScreenTitle>Manage</ScreenTitle>
        <Text variant="body">Deciding here is the same as the buttons in Discord.</Text>
        <View style={styles.picker}>
          <PickerPill title="Section" label={sectionLabel(tab)} value={tab}
            options={tabs.map(([value]) => ({ value, label: sectionLabel(value) }))} onChange={(v) => setTab(v as Tab)} />
          {/* What's waiting elsewhere, so it isn't hidden behind the dropdown. */}
          {tabs.filter(([id, , n]) => id !== tab && n > 0).map(([id, label, n]) => (
            <Text key={id} variant="meta" style={styles.waiting} onPress={() => setTab(id)} accessibilityRole="button"
              accessibilityLabel={`${label}, ${n} ${word(id)}. Opens it.`}>{label} · {n} {word(id)}</Text>
          ))}
        </View>
        <View style={styles.section}>
          {tab === "requests" ? <RequestsSection /> : tab === "all" ? <AllRequestsSection /> : tab === "joins" ? <JoinsSection /> : tab === "people" ? <PeopleSection />
            : tab === "invites" ? <InvitesSection /> : tab === "cleanup" ? <CleanupSection /> : tab === "messages" ? <MessagesSection />
            : tab === "health" ? <HealthSection /> : <DiscordSection />}
        </View>
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.s },
  picker: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.m, paddingVertical: space.s },
  waiting: { color: color.screen, minHeight: 40, textAlignVertical: "center", lineHeight: 40 },
  section: { gap: space.m },
});
