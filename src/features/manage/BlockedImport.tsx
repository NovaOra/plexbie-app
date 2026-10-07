// A finished download Sonarr or Radarr won't import by themselves (the bot opens a ticket
// for each, core/blocked_imports): why, what's in it, and what looks off, then a long hold
// to import it through their own Manual Import. Never blind: the files come first.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { ApiError, IMPORT_TIMEOUT_MS } from "../../api/client";
import type { AppArrEpisode, AppArrItem, AppBlockedRef } from "../../api/schemas";
import type { BlockedChoice } from "../../api/types";
import { Chip } from "../../ui/Chip";
import { PickerPill } from "../../ui/PickerSheet";
import { useApi } from "../../auth/session";
import { Button } from "../../ui/Button";
import { HoldButton } from "../../ui/HoldButton";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { Heading } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";

/** What the button says while it's held: a little ceremony, so nobody imports blind. */
const STAGES = ["Did you look at the files? 👀", "Sizes? Episodes? No .exe? 🧐", "Okay, okay. Going in 3…", "2…", "1…"];

/** Imports that got no answer, by app and download, with when they were sent: Sonarr or Radarr
 *  may still be at it, so Import stays off for as long as the app would have waited. Kept
 *  outside the component, so leaving and coming back doesn't turn it on again. */
const stillImporting = new Map<string, number>();

const bytes = (n: number) => n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : n >= 2 ** 20 ? `${Math.round(n / 2 ** 20)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function BlockedImport({ target, onDone }: { target: AppBlockedRef; onDone?: () => void }) {
  const client = useApi();
  const { busy, act } = useAct();
  const [done, setDone] = useState("");
  const [picks, setPicks] = useState<Record<string, BlockedChoice & { movieLabel?: string }>>({});
  const [series, setSeries] = useState<AppArrItem | null>(null);
  const [eps, setEps] = useState<AppArrEpisode[] | null>(null);
  const [epsFailed, setEpsFailed] = useState(false);
  /** Which "Wrong show?" pick the episodes being asked for belong to: a slower answer for an earlier one is dropped. */
  const epsAsked = useRef(0);
  const [finding, setFinding] = useState<string | null>(null);   // "series", or a file name for "Wrong film?"
  const [, wake] = useState(0);
  const preview = useQuery({
    queryKey: ["blocked", target.app, target.downloadId],
    queryFn: ({ signal }) => client.blockedPreview(target.app, target.downloadId, signal),
    retry: false,
  });
  const app = target.app === "sonarr" ? "Sonarr" : "Radarr";
  const tv = target.app === "sonarr";
  const p = preview.data;
  /** Another show was picked and its episodes aren't here yet (or couldn't be had). */
  const epsWaiting = !!series && !eps;
  const episodes = series ? eps ?? [] : p?.options.episodes ?? [];
  const known = new Set(episodes.map((e) => e.id));
  const sent = `${target.app}:${target.downloadId}`;
  const since = stillImporting.get(sent);
  const waiting = since !== undefined && Date.now() - since < IMPORT_TIMEOUT_MS;
  useEffect(() => {
    if (since === undefined) return;
    const t = setTimeout(() => {
      stillImporting.delete(sent);
      wake((n) => n + 1);
      void preview.refetch();
    }, Math.max(0, since + IMPORT_TIMEOUT_MS - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, since]);
  const pick = (name: string, change: Partial<BlockedChoice & { movieLabel?: string }>) =>
    setPicks((x) => ({ ...x, [name]: { ...x[name], name, ...change } }));

  const files = (p?.files ?? []).map((f) => {
    const c = picks[f.name] ?? { name: f.name };
    const episodeIds = c.episodeIds ?? (series ? [] : f.episodes.map((e) => e.id));
    const movieId = c.movieId ?? f.movie?.id;
    const film = c.movieLabel ?? f.movie?.title;
    // With another show picked, only its own episodes count (Sonarr refuses any other).
    return { f, c, skip: !!c.skip, episodeIds, movieId, film,
      placed: tv ? episodeIds.length > 0 && (!series || episodeIds.every((id) => known.has(id))) : !!movieId };
  });
  // Two files as one episode, or as one film (Radarr keeps one file per film: CD1 and CD2, or a sample).
  const used = new Map<number, number>();
  files.filter((x) => !x.skip).forEach((x) => (tv ? x.episodeIds : x.movieId ? [x.movieId] : [])
    .forEach((id) => used.set(id, (used.get(id) ?? 0) + 1)));
  const doubled = [...used].filter(([, n]) => n > 1).map(([id]) => tv ? episodes.find((e) => e.id === id)?.label ?? "an episode"
    : files.find((x) => x.movieId === id)?.film ?? "the same film");
  const going = files.filter((x) => !x.skip);
  const unplaced = going.filter((x) => !x.placed);
  const blocker = !going.length ? "Every file is skipped." : epsWaiting ? (epsFailed ? `Try again for ${series.title}’s episodes, or pick another show.` : `Pick the episodes once ${series.title}’s have loaded.`)
    : unplaced.length ? `Pick which ${tv ? "episode" : "film"} ${unplaced[0].f.name} is, or skip it.`
    : doubled.length ? `Two files are set as ${doubled[0]}.` : "";

  const go = async () => {
    const choices: BlockedChoice[] = files.map(({ f, c, skip, episodeIds }) => {
      const { movieLabel: _label, ...rest } = c;
      return { ...rest, name: f.name, ...(skip ? { skip: true } : {}), ...(tv ? { episodeIds, ...(series ? { seriesId: series.id } : {}) } : {}) };
    });
    // No answer: Import stays off until the ticket, the waiting list and this preview have reloaded,
    // and then for as long as the import could still be running.
    const started = Date.now();
    const call = () => client.blockedImport(target.app, target.downloadId, choices).catch((e: unknown) => {
      if (e instanceof ApiError && e.unanswered) stillImporting.set(sent, started);
      throw e;
    });
    const out = await act("import", call,
      { done: (o) => ({ text: "Imported", detail: o.message || undefined }), failText: "Not imported", refresh: ["tickets", "all", "health"],
        recheck: () => preview.refetch(), reward: true });
    if (out) { setDone(out.message || "Imported."); onDone?.(); return; }
    // Not imported: what was seen may have changed ("look again"), so start over from a fresh
    // look inside. One that got no answer has been looked at again already.
    epsAsked.current++;
    setPicks({});
    setSeries(null);
    setEps(null);
    setEpsFailed(false);
    setFinding(null);
    if (stillImporting.get(sent) !== started) void preview.refetch();
  };
  const useSeries = async (s: AppArrItem) => {
    const asked = ++epsAsked.current;
    setFinding(null);
    setSeries(s);
    setPicks({});
    setEps(null);
    setEpsFailed(false);
    try {
      const { rows } = await client.arrEpisodes(s.id);
      if (asked === epsAsked.current) setEps(rows);
    } catch {
      if (asked === epsAsked.current) setEpsFailed(true);
    }
  };
  const episodeOptions = episodes.map((e) => ({ value: String(e.id), label: `${e.label} · ${e.title || "TBA"}${e.hasFile ? " (has a file)" : ""}` }));
  const owner = series ?? p?.series;

  return (
    <View style={styles.box} accessibilityLabel={`${app} won’t import this by itself`}>
      <Text variant="label" style={styles.head}>⚠︎ {app} won’t import this by itself</Text>
      {preview.error ? (
        <>
          <Text variant="meta">{preview.error.message}</Text>
          <Button kind="secondary" label="Try again" busy={preview.isFetching} busyLabel="Looking inside…"
            onPress={() => void preview.refetch()} style={styles.start} />
        </>
      ) : !p ? <Text variant="meta">Looking inside…</Text> : (
        <>
          {p.messages.map((m) => <Text key={m} variant="meta" style={styles.why}>{app} says: “{m}”</Text>)}
          <Text variant="body">Look before you import. Usually it’s fine (a name {app} couldn’t match), but a blocked import can be the wrong episode, the wrong film, or something that shouldn’t be there. Check each file is what {app} thinks it is.</Text>
          {p.warnings.map((w) => <Text key={w} variant="label" style={styles.warn}>⚠︎ {w}</Text>)}
          {tv ? (
            <View style={styles.owner}>
              <Text variant="label">Show: {owner?.title ?? "none"}{owner?.year ? ` (${owner.year})` : ""}</Text>
              <Button kind="secondary" label="Wrong show?" onPress={() => setFinding(finding === "series" ? null : "series")} style={styles.start} />
              {finding === "series" ? <ArrFinder app="sonarr" onPick={(s) => void useSeries(s)} /> : null}
              {series && epsWaiting ? (epsFailed ? (
                <>
                  <Text variant="meta" style={styles.warn}>Couldn’t get {series.title}’s episodes from Sonarr.</Text>
                  <Button kind="secondary" label="Try again" onPress={() => void useSeries(series)} style={styles.start} />
                </>
              ) : <Text variant="meta">Loading episodes…</Text>) : null}
            </View>
          ) : null}
          {files.map(({ f, c, skip, episodeIds, placed }) => (
            <View key={f.name} style={[styles.file, skip ? styles.other : (!placed || f.notes.length > 0) && styles.odd]}>
              <Text variant="label" selectable>{f.name}</Text>
              <Text variant="meta">{bytes(f.size)}</Text>
              {f.rejections.map((r) => <Text key={r} variant="meta" style={styles.note}>{app}: {r}</Text>)}
              {f.notes.filter((n) => !f.rejections.includes(n) && !(placed && /can.t tell which/.test(n)))
                .map((n) => <Text key={n} variant="meta" style={styles.note}>{n}</Text>)}
              {!skip ? (
                <View style={styles.edit}>
                  {tv ? (epsWaiting ? null :
                    <PickerPill title="Which episode" multiple options={episodeOptions} value={episodeIds.map(String)}
                      label={episodeIds.length ? episodeIds.map((id) => episodes.find((e) => e.id === id)?.label ?? "?").join(" + ") : "Pick the episode…"}
                      onChange={(next) => pick(f.name, { episodeIds: (next as string[]).map(Number) })} />
                  ) : (
                    <>
                      <Text variant="meta">Film: {c.movieLabel ?? (f.movie ? `${f.movie.title}${f.movie.year ? ` (${f.movie.year})` : ""}` : "none")}</Text>
                      <Button kind="secondary" label="Wrong film?" onPress={() => setFinding(finding === f.name ? null : f.name)} style={styles.start} />
                      {finding === f.name ? <ArrFinder app="radarr" onPick={(m) => {
                        setFinding(null);
                        pick(f.name, { movieId: m.id, movieLabel: `${m.title}${m.year ? ` (${m.year})` : ""}` });
                      }} /> : null}
                    </>
                  )}
                  <View style={styles.pills}>
                    <PickerPill title="Quality" options={p.options.qualities.map((q) => ({ value: String(q.id), label: q.name }))}
                      value={String(c.qualityId ?? f.qualityId ?? "")}
                      label={p.options.qualities.find((q) => q.id === (c.qualityId ?? f.qualityId))?.name ?? "Quality"}
                      onChange={(v) => pick(f.name, { qualityId: Number(v) })} />
                    <PickerPill title="Language" options={p.options.languages.map((l) => ({ value: String(l.id), label: l.name }))}
                      value={String((c.languageIds ?? f.languages.map((l) => l.id))[0] ?? "")}
                      label={p.options.languages.find((l) => l.id === (c.languageIds ?? f.languages.map((x) => x.id))[0])?.name ?? "Language"}
                      onChange={(v) => pick(f.name, { languageIds: [Number(v)] })} />
                  </View>
                  <TextInput value={c.releaseGroup ?? f.releaseGroup} onChangeText={(v) => pick(f.name, { releaseGroup: v })} maxLength={60}
                    placeholder="Release group" placeholderTextColor={color.faint} accessibilityLabel="Release group" style={styles.input} />
                </View>
              ) : null}
              <Chip label={skip ? "Skipped: tap to import it" : "Don’t import this file"} selected={skip} onPress={() => pick(f.name, { skip: !skip })} />
            </View>
          ))}
          {p.others.map((o) => (
            <View key={o.name} style={[styles.file, o.danger ? styles.danger : styles.other]}>
              <Text variant="label" selectable>{o.name}</Text>
              <Text variant="meta">{bytes(o.size)} · {o.danger ? "a program, not a video" : "not imported"}</Text>
            </View>
          ))}
          <Text variant="meta" selectable>In {p.folder}</Text>
          {done ? <Text variant="label">✓ {done}</Text> : !p.ok ? (
            <Text variant="label" style={styles.warn}>Not importable from here: sort it out in {app}, or delete the download.</Text>
          ) : (
            <>
              {waiting ? <Text variant="label" style={styles.warn}>May still be importing: no answer came back. Import is off for a couple of minutes while {app} finishes.</Text>
                : blocker ? <Text variant="label" style={styles.warn}>{blocker}</Text> : null}
              <HoldButton label="Import it" stages={STAGES} bail="Chickened out. Fair. 🐔" disabled={!!busy || !!blocker || waiting || preview.isFetching}
                confirmText="Did you look at the files? It goes through Sonarr's or Radarr's own import." onConfirm={() => void go()} />
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Search Sonarr's shows or Radarr's films by title, to say which one it really is. */
function ArrFinder({ app, onPick }: { app: "sonarr" | "radarr"; onPick: (item: AppArrItem) => void }) {
  const client = useApi();
  const [q, setQ] = useState("");
  const words = q.trim().length >= 2 ? q.trim() : "";
  const found = useQuery({
    queryKey: ["arr-library", app, words], enabled: !!words,
    queryFn: ({ signal }) => client.arrLibrary(app, words, signal),
  });
  const name = app === "sonarr" ? "Sonarr" : "Radarr";
  return (
    <View style={styles.finder}>
      <TextInput value={q} onChangeText={setQ} autoFocus placeholder={app === "sonarr" ? "Find the show in Sonarr" : "Find the film in Radarr"}
        placeholderTextColor={color.faint} accessibilityLabel={app === "sonarr" ? "Find the show in Sonarr" : "Find the film in Radarr"} style={styles.input} />
      {!words ? null : found.data ? (found.data.rows.length ? found.data.rows.map((r) => (
        <Button key={r.id} kind="secondary" label={`${r.title}${r.year ? ` (${r.year})` : ""}`} onPress={() => onPick(r)} />
      )) : <Text variant="meta">Nothing in {name} by that name.</Text>)
        : found.isPaused ? <Text variant="meta">Offline. Plexbie searches when you’re back online.</Text>
        : found.error && !found.isFetching ? (
          <>
            <Text variant="meta" style={styles.warn}>Couldn’t search {name}.</Text>
            <Button kind="secondary" label="Try again" onPress={() => void found.refetch()} style={styles.start} />
          </>
        ) : <Text variant="meta" accessibilityLiveRegion="polite">Searching…</Text>}
    </View>
  );
}

/** Manage → Health: every download waiting for an admin to look at it. */
export function BlockedList() {
  const client = useApi();
  const qc = useQueryClient();
  const key = [...useAdminKey()("health"), "blocked"];
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => client.adminBlocked(signal), refetchInterval: 120_000 });
  const [open, setOpen] = useState<string | null>(null);
  const rows = list.data?.rows ?? [];
  if (!list.data && list.error) {
    return (
      <>
        <Heading title="Waiting for you to look" />
        <Text variant="meta" style={styles.warn}>Couldn’t check for blocked downloads.</Text>
        <Button kind="secondary" label="Try again" busy={list.isFetching} busyLabel="Checking…" onPress={() => void list.refetch()} style={styles.start} />
      </>
    );
  }
  if (!rows.length) return null;
  return (
    <>
      <Heading title="Waiting for you to look" />
      {rows.map((r) => {
        const id = `${r.app}:${r.downloadId}`;
        return (
          <View key={id} style={styles.row}>
            <Text variant="eyebrow">{r.app === "sonarr" ? "Sonarr" : "Radarr"} · import blocked{r.episodes.length ? ` · ${r.episodes.join(", ")}` : ""}</Text>
            <Text variant="title">{r.title}{r.year ? ` (${r.year})` : ""}</Text>
            {open === id ? <BlockedImport target={r} onDone={() => setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 1500)} />
              : <Button kind="secondary" label="Look inside" onPress={() => setOpen(id)} style={styles.start} />}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.m, padding: space.l, borderRadius: radius.m, borderWidth: 1, borderColor: "rgba(255, 92, 147, 0.45)",
    backgroundColor: "rgba(255, 92, 147, 0.08)" },
  head: { color: color.tally },
  why: { fontStyle: "italic" },
  warn: { color: color.tally },
  file: { gap: 2, padding: space.m, borderRadius: radius.s, backgroundColor: "rgba(255, 255, 255, 0.04)" },
  odd: { borderLeftWidth: 3, borderLeftColor: color.tally },
  danger: { borderLeftWidth: 3, borderLeftColor: color.tally, backgroundColor: "rgba(255, 92, 147, 0.14)" },
  other: { opacity: 0.75 },
  note: { color: color.tally },
  owner: { gap: space.s },
  edit: { gap: space.s, marginTop: space.xs },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  finder: { gap: space.s },
  input: { minHeight: 44, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16 },
  row: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  start: { alignSelf: "flex-start" },
});
