// Manage → Tickets: "Something wrong?" from members, and tickets admins open from a
// request. The ones needing an admin first; a ticket opens on its own screen, where it's
// talked through, fixed and solved.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AppAdminTicketRow } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { GlassFill, glass } from "../../ui/Glass";
import { PickerPill } from "../../ui/PickerSheet";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { formatSlot, since } from "../requests/stage";
import { useMe } from "../me/useMe";
import { TicketPill, ticketState } from "../tickets/Thread";
import { AllClear } from "./bits";
import { seasonsChip } from "./RequestsSection";
import { useAdminKey } from "./useAdmin";

type Show = "action" | "waiting" | "mine" | "solved" | "everything";

/** Every ticket, kept fresh while Manage is open (also feeds the "· 2 open" label and the tab badge). */
export function useTickets(enabled = true) {
  const client = useApi();
  const key = useAdminKey();
  return useQuery({ queryKey: key("tickets"), queryFn: ({ signal }) => client.adminTickets(signal), refetchInterval: 60_000, enabled });
}

export function TicketsSection() {
  const tickets = useTickets();
  const me = useMe().data?.user.name;
  const [show, setShow] = useState<Show>("action");
  const list = tickets.data;
  if (!list) {
    return tickets.error
      ? <Text variant="meta" style={styles.bad}>Couldn’t load tickets. Pull down to try again.</Text>
      : <View style={styles.skeleton} accessibilityLabel="Loading" accessible />;
  }
  const mine = list.rows.filter((t) => t.status === "open" && !!me && t.owner === me).length;
  const rows = list.rows.filter((t) =>
    show === "action" ? t.status === "open" && !t.waiting : show === "waiting" ? t.status === "open" && t.waiting
      : show === "mine" ? t.status === "open" && !!me && t.owner === me : show === "solved" ? t.status !== "open" : true);
  const options: { value: Show; label: string }[] = [
    { value: "action", label: `Needs an admin · ${list.counts.action}` },
    { value: "waiting", label: `Waiting on them · ${list.counts.waiting}` },
    { value: "mine", label: `Mine · ${mine}` },
    { value: "solved", label: `Solved · ${list.counts.solved}` },
    { value: "everything", label: `Everything · ${list.rows.length}` },
  ];
  return (
    <View style={styles.section}>
      <Text variant="body">“Something wrong?” from members, and tickets admins open from a request. Open one to talk it through, fix it and solve it.</Text>
      <View style={styles.picker}>
        <PickerPill title="Show" label={options.find((o) => o.value === show)!.label} value={show} options={options} onChange={(v) => setShow(v as Show)} />
      </View>
      {rows.length ? rows.map((t) => <TicketRow key={t.id} t={t} />) : (
        <AllClear title={show === "action" ? "Nothing needs an admin" : show === "waiting" ? "Nobody to wait on" : show === "mine" ? "None are yours" : show === "solved" ? "Nothing solved yet" : "No tickets yet"}>
          {show === "action" ? "When a member says something’s wrong, it shows up here and in Discord." : show === "waiting" ? "No ticket is waiting on a member’s answer."
            : show === "mine" ? "Take a ticket and it shows here." : "Solved tickets stay here for a while."}
        </AllClear>
      )}
    </View>
  );
}

function TicketRow({ t }: { t: AppAdminTicketRow }) {
  const state = ticketState(t);
  const seasons = seasonsChip(t.seasons);
  const asked = t.openedBy ? `opened by ${t.openedBy}` : `asked by ${t.who}`;
  return (
    <PressableScale haptic="none" onPress={() => router.push({ pathname: "/manage-ticket/[id]", params: { id: t.id } })}
      accessibilityLabel={`${t.title}${seasons ? `, ${seasons}` : ""}. ${t.reason}. ${state.label}. ${t.owner ? `${t.owner} has it` : "Nobody has it yet"}. ${t.last ? `Last: ${t.last.by}: ${t.last.text}` : ""}`}
      accessibilityHint="Opens the ticket">
      <View style={[styles.card, glass.surface, state.tone === "hot" && styles.hot]}>
        <GlassFill radius={radius.m} />
        <Text variant="eyebrow" numberOfLines={1}>No. {formatSlot(t.slot)} · {asked} · {since(t.updatedAt)}</Text>
        <Text variant="title" numberOfLines={2}>{t.title}{seasons ? ` · ${seasons}` : ""}</Text>
        <Text variant="meta">{t.reason}</Text>
        {t.last ? <Text variant="meta" numberOfLines={2}><Text variant="meta" style={styles.ink}>{t.last.by}:</Text> {t.last.text}</Text> : null}
        <View style={styles.pills}>
          <TicketPill label={state.label} tone={state.tone} />
          <TicketPill label={t.owner ? `${t.owner} has it` : "Nobody has it yet"} tone="plain" />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.m },
  picker: { flexDirection: "row" },
  card: { gap: space.xs, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  hot: { borderColor: "rgba(255, 92, 147, 0.6)" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  ink: { color: color.ink },
  skeleton: { height: 120, borderRadius: radius.m, backgroundColor: color.panel },
  bad: { color: color.tally },
});
