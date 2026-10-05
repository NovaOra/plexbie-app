// Manage → All requests: everyone's approved requests and where each one is now, the ones
// that look stuck first. Without a search it's what's on its way plus the last 30 days of
// finished; a search reaches any request ever. A row opens the request in full.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { AppAdminRequestRow } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { PickerPill } from "../../ui/PickerSheet";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { RequestCard } from "../requests/RequestCard";
import { AllClear } from "./bits";
import { useAdminKey } from "./useAdmin";

type Show = "progress" | "stuck" | "finished" | "everything";

/** Everyone's requests, kept fresh while Manage is open (also feeds the "· 2 stuck" label). */
export function useAllRequests() {
  const client = useApi();
  const key = useAdminKey();
  return useQuery({ queryKey: key("all"), queryFn: ({ signal }) => client.adminAll("", signal), refetchInterval: 60_000 });
}

export function AllRequestsSection() {
  const client = useApi();
  const key = useAdminKey();
  const all = useAllRequests();
  const counts = all.data?.counts ?? { active: 0, stuck: 0, finished: 0 };
  const [show, setShow] = useState<Show>(counts.stuck ? "stuck" : "progress");
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
  const rows = words ? found.data?.rows ?? [] : (all.data?.rows ?? []).filter((r) =>
    show === "progress" ? r.stage !== "available" : show === "stuck" ? r.stuck.length > 0 : show === "finished" ? r.stage === "available" : true);
  const options: { value: Show; label: string }[] = [
    { value: "progress", label: `In progress · ${counts.active}` },
    { value: "stuck", label: `Looks stuck · ${counts.stuck}` },
    { value: "finished", label: `Finished (30 days) · ${counts.finished}` },
    { value: "everything", label: `Everything · ${all.data?.rows.length ?? 0}` },
  ];

  return (
    <View style={styles.section}>
      <Text variant="body">Everyone’s approved requests and where each one is now. Open one to search again or open a ticket.</Text>
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
        <AllClear title={show === "stuck" ? "Nothing looks stuck" : show === "finished" ? "Nothing finished lately" : "Nothing on its way"}>
          {show === "finished" ? "Requests that reached Plex in the last 30 days show here." : "Approved requests show here until they reach Plex."}
        </AllClear>
      ) : null}
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
});
