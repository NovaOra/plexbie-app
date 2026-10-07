// Manage → Cleanup: what media cleanup does (off, practice, live), its timing, which
// libraries it skips and where it posts, and the titles on the clock. Going live, turning
// cleanup on while it's set to live, and a scan while live ask first: live really deletes
// files. Keep forever has Undo, and any film or show can be found on Plex by title and kept,
// the same as /cleanup exempt add in Discord.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SwitchRow } from "../../ui/SwitchRow";
import { ApiError } from "../../api/client";
import type { AppAdminCleanup, AppCleanupMatch, AppCleanupRow, AppCleanupSettings, AppKept } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Chip } from "../../ui/Chip";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { AllClear, Heading, card } from "./bits";
import { Stepper } from "./Stepper";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";
import { EdgeRow } from "../../ui/EdgeRow";

type View3 = "soon" | "next" | "kept";
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
function clockText(reason: string, when?: string) {
  if (reason === "added") return `Added ${shortDate(when)}, not watched since`.replace("Added ,", "Added,");
  if (reason === "requested") return `Requested ${shortDate(when)}`;
  return `Last watched ${shortDate(when)}`;
}

/** `onFieldFocus` scrolls Manage to its end, so the title search at the bottom shows above the keyboard. */
export function CleanupSection({ onFieldFocus }: { onFieldFocus?: () => void }) {
  const client = useApi();
  const key = useAdminKey()("cleanup");
  const cleanup = useQuery({ queryKey: key, queryFn: ({ signal }) => client.adminCleanup(signal), staleTime: 60_000 });
  const [view, setView] = useState<View3>("soon");
  const d = cleanup.data;
  if (!d) {
    return cleanup.error ? (
      <>
        <Text variant="body">Couldn’t load cleanup. {cleanup.error.message}</Text>
        <Button kind="secondary" label="Try again" onPress={() => void cleanup.refetch()} style={styles.start} />
      </>
    ) : <View style={[card.box, { height: 220 }]} />;
  }
  const views: [View3, string, number][] = [["soon", "Leaving soon", d.warning.length], ["next", "Next up", d.upcoming.length], ["kept", "Kept", d.exempt.length]];
  return (
    <>
      <Settings d={d} />
      <Heading title="On the clock" />
      <EdgeRow>
        {views.map(([id, label, n]) => <Chip key={id} label={`${label} · ${n}`} selected={view === id} onPress={() => setView(id)} />)}
      </EdgeRow>
      <Rows d={d} view={view} />
      <Heading title="Keep a title forever" />
      <KeepSearch kept={d.exempt} onFocus={onFieldFocus} />
    </>
  );
}

function Settings({ d }: { d: AppAdminCleanup }) {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("cleanup");
  const { act } = useAct();
  const s = d.settings;
  const live = s.enabled && !s.practice;
  const [days, setDays] = useState(s.inactivityDays);
  const [warn, setWarn] = useState(s.warnDaysBefore);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Partial<AppCleanupSettings> | undefined>(undefined);
  // Saves can overlap. Per setting: the latest save that sent it, and the value to put back if
  // that save fails (what the server last took, or had before any of them).
  const saves = useRef(0);
  const owner = useRef(new Map<keyof AppCleanupSettings, { n: number; back: unknown }>());
  useEffect(() => { setDays(s.inactivityDays); setWarn(s.warnDaysBefore); }, [s.inactivityDays, s.warnDaysBefore]);

  const save = async (change: Partial<AppCleanupSettings>) => {
    const n = ++saves.current;
    const fields = Object.keys(change) as (keyof AppCleanupSettings)[];
    const now = qc.getQueryData<AppAdminCleanup>(key)?.settings;
    for (const k of fields) owner.current.set(k, { n, back: owner.current.has(k) ? owner.current.get(k)!.back : now?.[k] });
    qc.setQueryData<AppAdminCleanup>(key, (x) => x && { ...x, settings: { ...x.settings, ...change } });
    const out = await act(null, () => client.cleanupSettings(change), { done: (o) => ({ text: "Cleanup settings saved", detail: o.message || undefined }) });
    // A failure puts back only the settings no later save has sent since; a save that went
    // through becomes what a later one falls back to.
    const restore: Partial<AppCleanupSettings> = {};
    for (const k of fields) {
      const o = owner.current.get(k);
      if (!o) continue;
      if (o.n === n) {
        owner.current.delete(k);
        if (!out && o.back !== undefined) Object.assign(restore, { [k]: o.back });
      } else if (out) o.back = change[k];
    }
    if (Object.keys(restore).length) qc.setQueryData<AppAdminCleanup>(key, (x) => x && { ...x, settings: { ...x.settings, ...restore } });
    setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 600);
  };
  // Numbers wait until the tapping stops, then save once; leaving the section saves at once.
  const flushNumbers = () => {
    clearTimeout(timer.current);
    const change = pending.current;
    pending.current = undefined;
    if (change) void save(change);
  };
  const flushRef = useRef(flushNumbers);
  useEffect(() => { flushRef.current = flushNumbers; });
  useEffect(() => () => flushRef.current(), []);
  const saveNumbers = (nextDays: number, nextWarn: number) => {
    setDays(nextDays);
    setWarn(nextWarn);
    clearTimeout(timer.current);
    pending.current = { inactivityDays: nextDays, warnDaysBefore: Math.min(nextWarn, nextDays - 1) };
    timer.current = setTimeout(flushNumbers, 900);
  };
  const setEnabled = (on: boolean) => (on && !s.practice
    ? confirm("Go live?", "Cleanup is set to live: it will really delete titles from the server when their time runs out.", [
      { text: "Not now", style: "cancel" },
      { text: "Turn on in practice", onPress: () => void save({ enabled: true, practice: true }) },
      { text: "Turn on, live", style: "destructive", onPress: () => void save({ enabled: true }) },
    ])
    // Sends the mode on screen too, so a practice save that failed meanwhile can't make this go live.
    : void save(on ? { enabled: true, practice: true } : { enabled: false }));
  const goLive = () => confirm("Go live?", "Cleanup will really delete titles from the server when their time runs out.", [
    { text: "Stay in practice", style: "cancel" },
    { text: "Go live", style: "destructive", onPress: () => void save({ practice: false }) },
  ]);
  const scan = async () => {
    setScanning(true);
    await act(null, () => client.cleanupScan(), { done: (o) => ({ text: "Cleanup scan finished", detail: o.message || undefined }), failText: "Scan didn’t run" });
    // Busy until the section has reloaded: after no answer, the scan may still be running.
    await qc.invalidateQueries({ queryKey: key });
    setScanning(false);
  };
  const confirmScan = () => (live
    ? confirm("Scan now, live?", "Anything past its time is deleted from the server right away.", [
      { text: "Not now", style: "cancel" },
      { text: "Scan and delete", style: "destructive", onPress: () => void scan() },
    ])
    : void scan());

  return (
    <View style={[card.box, glass.surface, live && styles.live]}>
      <GlassFill radius={radius.m} />
      <View style={styles.mode}>
        <View style={[styles.dot, live ? styles.dotLive : s.enabled ? styles.dotPractice : styles.dotOff]} />
        <Text variant="title">{s.enabled ? (s.practice ? "Practice mode" : "Live") : "Cleanup is off"}</Text>
      </View>
      <Text variant="meta">
        {s.enabled ? (s.practice ? "Nothing is deleted; Plexbie only reports what it would remove."
          : `Titles nobody has watched or asked for in ${s.inactivityDays} days are deleted. A warning goes out ${s.warnDaysBefore} days before.`)
          : "Nothing is being removed."}
        {s.excludedLibraries.length ? ` Skips ${s.excludedLibraries.join(", ")}.` : ""}
      </Text>

      <SwitchRow label="Cleanup, checks every day for titles nobody watches" value={s.enabled} onValueChange={setEnabled} style={styles.switchRow}>
        <Text variant="label">Cleanup</Text>
        <Text variant="meta">Check every day for titles nobody watches.</Text>
      </SwitchRow>
      <Row title={s.practice ? "Practice mode" : "Live mode"} detail={s.practice ? "Reports what it would delete, deletes nothing." : "Really deletes the files from the server."}>
        {s.practice
          ? <Button kind="danger" label="Go live" disabled={!s.enabled} onPress={goLive} />
          : <Button kind="secondary" label="Practice" onPress={() => void save({ practice: true })} accessibilityLabel="Switch to practice mode" />}
      </Row>
      <View style={styles.steppers}>
        <Stepper label="Remove after" suffix="days" value={days} min={30} max={3650} step={5} onChange={(n) => saveNumbers(n, Math.min(warn, n - 1))} />
        <Stepper label="Warn" suffix="days before" value={warn} min={1} max={Math.max(1, days - 1)} onChange={(n) => saveNumbers(days, n)} />
      </View>
      {d.libraries?.length ? (
        <View style={styles.block}>
          <Text variant="label">Libraries cleanup skips</Text>
          <View style={styles.wrap}>
            {d.libraries.map((lib) => {
              const skipped = s.excludedLibraries.includes(lib);
              return <Chip key={lib} role="checkbox" label={lib} selected={skipped} accessibilityLabel={`Skip ${lib}`}
                onPress={() => void save({ excludedLibraries: skipped ? s.excludedLibraries.filter((l) => l !== lib) : [...s.excludedLibraries, lib] })} />;
            })}
          </View>
        </View>
      ) : null}
      {d.channels?.length ? (
        <View style={styles.block}>
          <Text variant="label">Post cleanup notices in</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Nowhere" selected={!s.channelId} onPress={() => void save({ channelId: null })} />
            {d.channels.map((c) => <Chip key={c.id} label={`#${c.name}`} selected={s.channelId === c.id} onPress={() => void save({ channelId: c.id })} />)}
          </ScrollView>
        </View>
      ) : null}
      <Row title="Run a scan now" detail={live ? "Live: anything past its time is deleted right away." : "Same check the daily run does."}>
        <Button kind={live ? "danger" : "secondary"} label="Scan now" busy={scanning} busyLabel="Scanning…" disabled={!s.enabled} onPress={confirmScan} />
      </Row>
    </View>
  );
}

function Row({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{title}</Text>
        <Text variant="meta">{detail}</Text>
      </View>
      {children}
    </View>
  );
}

/** Keep forever, or put back on the clock, a title from the countdown or the search. */
function useKeep() {
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("cleanup");
  const { act } = useAct();
  const keep = async (row: AppCleanupRow | AppKept | AppCleanupMatch, on: boolean, quiet = false) => {
    const before = qc.getQueryData<AppAdminCleanup>(key);
    // Move it straight away; the server confirms, and a failure puts it back.
    qc.setQueryData<AppAdminCleanup>(key, (x) => x && (on
      ? {
        ...x,
        warning: x.warning.filter((c) => c.ratingKey !== row.ratingKey),
        upcoming: x.upcoming.filter((c) => c.ratingKey !== row.ratingKey),
        exempt: [{ ratingKey: row.ratingKey, title: row.title, type: row.type ?? null, year: typeof row.year === "number" ? row.year : null }, ...x.exempt.filter((e) => e.ratingKey !== row.ratingKey)],
      }
      : { ...x, exempt: x.exempt.filter((e) => e.ratingKey !== row.ratingKey) }));
    const out = await act(null, () => client.exempt(row.ratingKey, on), {
      done: () => (quiet ? null : { text: on ? `${row.title} is kept forever.` : `${row.title} is back on the clock.`, action: { label: "Undo", onPress: () => void keep(row, !on, true) } }),
    });
    // A failure puts back only this title, where it was: other changes may have landed since.
    if (!out && before) {
      const back = <T extends { ratingKey: string }>(now: T[], was: T[]) => {
        const rest = now.filter((r) => r.ratingKey !== row.ratingKey);
        const at = was.findIndex((r) => r.ratingKey === row.ratingKey);
        return at < 0 ? rest : [...rest.slice(0, at), was[at], ...rest.slice(at)];
      };
      qc.setQueryData<AppAdminCleanup>(key, (x) => x && {
        ...x, warning: back(x.warning, before.warning), upcoming: back(x.upcoming, before.upcoming), exempt: back(x.exempt, before.exempt),
      });
    }
    setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 900);
  };
  return keep;
}

/** What a title is: film or TV, and its year when Plex knows it. */
const kindText = (type?: string | null, year?: number | null) =>
  `${type === "show" ? "TV" : type === "movie" ? "Film" : type || "Title"}${year ? ` · ${year}` : ""}`;

function Rows({ d, view }: { d: AppAdminCleanup; view: View3 }) {
  const keep = useKeep();
  const ring = (days: number) => (
    <View style={[styles.ring, days <= 7 && styles.ringHot]} importantForAccessibility="no" accessibilityElementsHidden>
      <Text style={[styles.ringText, days <= 7 && styles.hot]}>{days}</Text>
    </View>
  );
  if (view === "kept") {
    return d.exempt.length ? <>{d.exempt.map((e) => (
      <SwitchRow key={e.ratingKey} label={`Keep forever, ${e.title}`} value onValueChange={() => void keep(e, false)} style={styles.item}>
        <View style={styles.itemInner}>
          <View style={[styles.ring, styles.ringKept]}><Text style={styles.ringText}>✓</Text></View>
          <View style={{ flex: 1 }}>
            <Text variant="label">{e.title}</Text>
            <Text variant="meta">{kindText(e.type, e.year)} · never removed</Text>
          </View>
        </View>
      </SwitchRow>
    ))}</> : <AllClear title="Nothing kept forever yet">Flip Keep on any title, or search for one below, and cleanup will never touch it.</AllClear>;
  }
  const rows = view === "soon" ? d.warning : d.upcoming;
  if (!rows.length) {
    return view === "soon"
      ? <AllClear title="Nothing leaving this week">{`No title is inside the ${d.settings.warnDaysBefore}-day warning window.`}</AllClear>
      : <AllClear title="Nothing next">Nothing else is on the clock.</AllClear>;
  }
  return <>{rows.map((c) => (
    <SwitchRow key={c.ratingKey} value={false} onValueChange={() => void keep(c, true)} style={styles.item}
      label={`Keep forever, ${c.title}: ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left, ${c.type === "show" ? "TV" : "film"}, ${clockText(c.reason, c.lastActivity)}`}>
      <View style={styles.itemInner}>
        {ring(c.daysLeft)}
        <View style={{ flex: 1 }}>
          <Text variant="label">{c.title}</Text>
          <Text variant="meta"><Text variant="meta" style={c.daysLeft <= 7 ? styles.hot : undefined}>{c.daysLeft === 1 ? "1 day left" : `${c.daysLeft} days left`}</Text> · {c.type === "show" ? "TV" : "Film"} · {clockText(c.reason, c.lastActivity)}</Text>
        </View>
      </View>
    </SwitchRow>
  ))}</>;
}

/**
 * Any film or show on Plex, not only the ones on the clock: the same title search as
 * /cleanup exempt add in Discord, without the libraries cleanup skips.
 */
function KeepSearch({ kept, onFocus }: { kept: AppKept[]; onFocus?: () => void }) {
  const client = useApi();
  const key = useAdminKey()("cleanup");
  const keep = useKeep();
  const [q, setQ] = useState("");
  const [words, setWords] = useState("");
  // Waits for a pause in typing, then asks the bot (each search asks Plex once per library).
  useEffect(() => {
    const t = setTimeout(() => setWords(q.trim().length >= 2 ? q.trim() : ""), 300);
    return () => clearTimeout(t);
  }, [q]);
  // Its own key, so reloading the countdown after a Keep doesn't search Plex again; nor does
  // coming back to the app or back online. Try again does.
  const found = useQuery({
    queryKey: ["cleanup-search", ...key, words], enabled: !!words,
    queryFn: ({ signal }) => client.cleanupSearch(words, signal),
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const rows = found.data ?? [];
  // A Plexbie from before this search has no such page: a bare 404, not one of the bot's own answers.
  const old = found.error instanceof ApiError && found.error.status === 404 && found.error.message === "The server said no (404).";
  return (
    <>
      <Text variant="body">Search Plex for any film or show, even one nowhere near the clock, and cleanup will never touch it.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search Plex by title" placeholderTextColor={color.faint}
        autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
        accessibilityLabel="Search Plex by title" onFocus={onFocus} style={styles.input} />
      {words ? (
        <Text variant="meta" accessibilityLiveRegion="polite">
          {found.data ? rows.length === 0 ? "Nothing on Plex by that title." : rows.length === 1 ? "1 title found" : `${rows.length} titles found`
            : found.isPaused ? "Offline. Plexbie searches when you’re back online."
            : found.error && !found.isFetching ? (old ? "This Plexbie can’t search Plex from the app yet. Update it, then try again." : `Couldn’t search Plex. ${found.error.message}`)
            : "Searching…"}
        </Text>
      ) : null}
      {words && found.error && !found.data && !found.isFetching ? (
        <Button kind="secondary" label="Try again" onPress={() => void found.refetch()} style={styles.start} />
      ) : null}
      {words ? rows.map((m) => {
        const on = kept.some((e) => e.ratingKey === m.ratingKey);
        return (
          <SwitchRow key={m.ratingKey} label={`Keep ${m.title} forever`} description={kindText(m.type, m.year)} value={on}
            onValueChange={() => void keep(m, !on)} style={styles.item}>
            <View style={styles.itemInner}>
              <View style={[styles.ring, on && styles.ringKept]}><Text style={styles.ringText}>{on ? "✓" : ""}</Text></View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{m.title}</Text>
                <Text variant="meta">{kindText(m.type, m.year)} · {on ? "never removed" : "cleanup can remove it"}</Text>
              </View>
            </View>
          </SwitchRow>
        );
      }) : null}
    </>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  live: { borderColor: color.tally },
  mode: { flexDirection: "row", alignItems: "center", gap: space.s },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLive: { backgroundColor: color.tally },
  dotPractice: { backgroundColor: color.screen },
  dotOff: { backgroundColor: color.slate },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule },
  steppers: { flexDirection: "row", flexWrap: "wrap", gap: space.l, paddingTop: space.s },
  block: { gap: space.s },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  chips: { gap: space.s, paddingVertical: space.xs },
  item: { padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  itemInner: { flexDirection: "row", alignItems: "center", gap: space.m },
  switchRow: { paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  ringHot: { borderColor: color.tally },
  ringKept: { borderColor: color.screen },
  ringText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  hot: { color: color.tally },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
});
