// Manage → Cleanup: what media cleanup does (off, practice, live), its timing, which
// libraries it skips and where it posts, and the titles on the clock. Going live, and a
// scan while live, ask first: live really deletes files. Keep forever has Undo.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SwitchRow } from "../../ui/SwitchRow";
import type { AppAdminCleanup, AppCleanupRow, AppCleanupSettings, AppKept } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Chip } from "../../ui/Chip";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
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

export function CleanupSection() {
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
  useEffect(() => { setDays(s.inactivityDays); setWarn(s.warnDaysBefore); }, [s.inactivityDays, s.warnDaysBefore]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = async (change: Partial<AppCleanupSettings>) => {
    const before = qc.getQueryData<AppAdminCleanup>(key);
    qc.setQueryData<AppAdminCleanup>(key, (x) => x && { ...x, settings: { ...x.settings, ...change } });
    const out = await act(null, () => client.cleanupSettings(change), { done: (o) => ({ text: "Cleanup settings saved", detail: o.message || undefined }) });
    if (!out && before) qc.setQueryData(key, before);
    setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 600);
  };
  // Numbers wait until the tapping stops, then save once.
  const saveNumbers = (nextDays: number, nextWarn: number) => {
    setDays(nextDays);
    setWarn(nextWarn);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ inactivityDays: nextDays, warnDaysBefore: Math.min(nextWarn, nextDays - 1) }), 900);
  };
  const goLive = () => confirm("Go live?", "Cleanup will really delete titles from the server when their time runs out.", [
    { text: "Stay in practice", style: "cancel" },
    { text: "Go live", style: "destructive", onPress: () => void save({ practice: false }) },
  ]);
  const scan = async () => {
    setScanning(true);
    await act(null, () => client.cleanupScan(), { done: (o) => ({ text: "Cleanup scan finished", detail: o.message || undefined }), failText: "Scan didn’t run" });
    setScanning(false);
    void qc.invalidateQueries({ queryKey: key });
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

      <SwitchRow label="Cleanup, checks every day for titles nobody watches" value={s.enabled} onValueChange={(on) => void save({ enabled: on })} style={styles.switchRow}>
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

function Rows({ d, view }: { d: AppAdminCleanup; view: View3 }) {
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("cleanup");
  const { act } = useAct();
  const keep = async (row: AppCleanupRow | AppKept, on: boolean, quiet = false) => {
    const before = qc.getQueryData<AppAdminCleanup>(key);
    // Move it straight away; the server confirms, and a failure puts it back.
    qc.setQueryData<AppAdminCleanup>(key, (x) => x && (on
      ? {
        ...x,
        warning: x.warning.filter((c) => c.ratingKey !== row.ratingKey),
        upcoming: x.upcoming.filter((c) => c.ratingKey !== row.ratingKey),
        exempt: [{ ratingKey: row.ratingKey, title: row.title, type: row.type ?? null }, ...x.exempt.filter((e) => e.ratingKey !== row.ratingKey)],
      }
      : { ...x, exempt: x.exempt.filter((e) => e.ratingKey !== row.ratingKey) }));
    const out = await act(null, () => client.exempt(row.ratingKey, on), {
      done: () => (quiet ? null : { text: on ? `${row.title} is kept forever.` : `${row.title} is back on the clock.`, action: { label: "Undo", onPress: () => void keep(row, !on, true) } }),
    });
    if (!out && before) qc.setQueryData(key, before);
    setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 900);
  };
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
            <Text variant="meta">{e.type === "show" ? "TV" : e.type === "movie" ? "Film" : e.type ?? "Title"} · never removed</Text>
          </View>
        </View>
      </SwitchRow>
    ))}</> : <AllClear title="Nothing kept forever yet">Flip Keep on any title and cleanup will never touch it.</AllClear>;
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
});
