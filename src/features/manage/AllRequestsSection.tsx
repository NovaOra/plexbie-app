// Manage → All requests: every request from everyone (waiting, approved, declined, on Plex)
// and where each one is now, the ones that look stuck first. It opens on the last 30 days
// (and anything still on its way); "Every request since No. 0001" loads the lot, and a search
// reaches any request ever. A row opens the request in full.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AppAdminRequestRow } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { PickerPill } from "../../ui/PickerSheet";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { RequestCard } from "../requests/RequestCard";
import { AllClear } from "./bits";
import { useAdminKey } from "./useAdmin";

type Show = "everything" | "progress" | "stuck" | "waiting" | "finished" | "declined";
const ENDED = ["declined", "closed"];
const showing = (show: Show, r: AppAdminRequestRow) =>
  show === "progress" ? !["available", "requested", ...ENDED].includes(r.stage) : show === "stuck" ? r.stuck.length > 0
    : show === "waiting" ? r.stage === "requested" : show === "finished" ? r.stage === "available" : show === "declined" ? ENDED.includes(r.stage) : true;

/** Everyone's requests, kept fresh while Manage is open (also feeds the "· 2 stuck" label). */
export function useAllRequests() {
  const client = useApi();
  const key = useAdminKey();
  return useQuery({ queryKey: key("all"), queryFn: ({ signal }) => client.adminAll("", signal), refetchInterval: 60_000 });
}

export function AllRequestsSection() {
  const client = useApi();
  const key = useAdminKey();
  const recent = useAllRequests();
  // Every request since No. 0001, fetched only when asked for.
  const [history, setHistory] = useState(false);
  const every = useQuery({
    queryKey: [...key("all"), "everything"], enabled: history,
    queryFn: ({ signal }) => client.adminAll("", signal, true),
  });
  const all = history && every.data ? every : recent;
  const counts = all.data?.counts ?? { active: 0, stuck: 0, finished: 0, waiting: 0, declined: 0 };
  const [show, setShow] = useState<Show>(recent.data?.counts?.stuck ? "stuck" : "everything");
  const [q, setQ] = useState("");
  const [words, setWords] = useState("");
  // Waits for a pause in typing, then asks the bot (it searches every request ever).
  useEffect(() => {
    const t = setTimeout(() => setWords(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const found = useQuery({
    queryKey: [...key("all"), "search", words], enabled: !!words,
    queryFn: ({ signal }) => client.adminAll(words, signal),
  });

  const open = (r: AppAdminRequestRow) => { if (r.id) router.push({ pathname: "/manage-request/[key]", params: { key: r.id } }); };
  const rows = words ? found.data?.rows ?? [] : (all.data?.rows ?? []).filter((r) => showing(show, r));
  const options: { value: Show; label: string }[] = [
    { value: "everything", label: `Every request · ${all.data?.rows.length ?? 0}` },
    { value: "progress", label: `On its way · ${counts.active}` },
    { value: "stuck", label: `Looks stuck · ${counts.stuck}` },
    { value: "waiting", label: `Waiting for a decision · ${counts.waiting}` },
    { value: "finished", label: `On Plex · ${counts.finished}` },
    { value: "declined", label: `Declined · ${counts.declined}` },
  ];
  const total = recent.data?.total ?? 0;

  return (
    <View style={styles.section}>
      <Text variant="body">
        Every request from everyone, waiting, approved or declined, and where each one is now. {history ? "Showing every request since No. 0001." : "Showing the last 30 days, and anything still on its way."}
      </Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search every request" placeholderTextColor={color.faint}
        autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
        accessibilityLabel="Search every request, by title, who asked, or number" style={styles.input} />
      {words ? (
        <Text variant="meta" accessibilityLiveRegion="polite">
          {found.isFetching && !found.data ? "Searching…" : rows.length === 0 ? "Nothing found" : rows.length === 1 ? "1 request found" : `${rows.length} requests found`}
        </Text>
      ) : (
        <View style={styles.picker}>
          <PickerPill title="Show" label={options.find((o) => o.value === show)!.label} value={show} options={options}
            onChange={(v) => setShow(v as Show)} />
        </View>
      )}
      {!words && all.isLoading ? <View style={styles.skeleton} accessibilityLabel="Loading" accessible /> : null}
      {!words && all.error ? <Text variant="meta" style={styles.bad}>Couldn’t load requests. Pull down to try again.</Text> : null}
      {rows.map((r) => (
        <RequestCard key={r.id ?? r.slot} request={r} by={r.requester} stuck={r.stuck} onPress={() => open(r)} />
      ))}
      {!words && all.data && !rows.length ? (
        <AllClear title={show === "stuck" ? "Nothing looks stuck" : show === "finished" ? "Nothing on Plex lately" : show === "waiting" ? "Nothing waiting"
          : show === "declined" ? "Nothing declined" : show === "progress" ? "Nothing on its way" : "No requests yet"}>
          {history ? "Nothing like this since No. 0001." : "In the last 30 days. “Every request since No. 0001” shows the rest."}
        </AllClear>
      ) : null}
      {!words ? (
        history ? (
          <Button kind="secondary" label="Back to the last 30 days" onPress={() => setHistory(false)} style={styles.more} />
        ) : (
          <Button kind="secondary" label={`Every request since No. 0001${total ? ` · ${total}` : ""}`} onPress={() => setHistory(true)} style={styles.more} />
        )
      ) : null}
      {history && every.isFetching && !every.data ? <Text variant="meta" accessibilityLiveRegion="polite">Loading every request…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.m },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  picker: { flexDirection: "row" },
  skeleton: { height: 120, borderRadius: radius.m, backgroundColor: color.panel },
  bad: { color: color.tally },
  more: { alignSelf: "center" },
});
