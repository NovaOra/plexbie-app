// A finished download Sonarr or Radarr won't import by themselves (the bot opens a ticket
// for each, core/blocked_imports): why, what's in it, and what looks off, then a long hold
// to import it through their own Manual Import. Never blind: the files come first.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
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

const bytes = (n: number) => n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : n >= 2 ** 20 ? `${Math.round(n / 2 ** 20)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function BlockedImport({ target, onDone }: { target: AppBlockedRef; onDone?: () => void }) {
  const client = useApi();
  const { busy, act } = useAct();
  const [done, setDone] = useState("");
  const [picks, setPicks] = useState<Record<string, BlockedChoice & { movieLabel?: string }>>({});
  const [series, setSeries] = useState<AppArrItem | null>(null);
  const [eps, setEps] = useState<AppArrEpisode[] | null>(null);
  const [finding, setFinding] = useState<string | null>(null);   // "series", or a file name for "Wrong film?"
  const preview = useQuery({
    queryKey: ["blocked", target.app, target.downloadId],
    queryFn: ({ signal }) => client.blockedPreview(target.app, target.downloadId, signal),
    retry: false,
  });
  const app = target.app === "sonarr" ? "Sonarr" : "Radarr";
  const tv = target.app === "sonarr";
  const p = preview.data;
  const episodes = eps ?? p?.options.episodes ?? [];
  const pick = (name: string, change: Partial<BlockedChoice & { movieLabel?: string }>) =>
    setPicks((x) => ({ ...x, [name]: { ...x[name], name, ...change } }));

  const files = (p?.files ?? []).map((f) => {
    const c = picks[f.name] ?? { name: f.name };
    const episodeIds = c.episodeIds ?? (series ? [] : f.episodes.map((e) => e.id));
    const movieId = c.movieId ?? f.movie?.id;
    return { f, c, skip: !!c.skip, episodeIds, placed: tv ? episodeIds.length > 0 : !!movieId };
  });
  const used = new Map<number, number>();
  files.filter((x) => !x.skip).forEach((x) => x.episodeIds.forEach((id) => used.set(id, (used.get(id) ?? 0) + 1)));
  const doubled = [...used].filter(([, n]) => n > 1).map(([id]) => episodes.find((e) => e.id === id)?.label ?? "an episode");
  const going = files.filter((x) => !x.skip);
  const unplaced = going.filter((x) => !x.placed);
  const blocker = !going.length ? "Every file is skipped." : unplaced.length ? `Pick which ${tv ? "episode" : "film"} ${unplaced[0].f.name} is, or skip it.`
    : doubled.length ? `Two files are set as ${doubled[0]}.` : "";

  const go = async () => {
    const choices: BlockedChoice[] = files.map(({ f, c, skip, episodeIds }) => {
      const { movieLabel: _label, ...rest } = c;
      return { ...rest, name: f.name, ...(skip ? { skip: true } : {}), ...(tv ? { episodeIds, ...(series ? { seriesId: series.id } : {}) } : {}) };
    });
    const out = await act("import", () => client.blockedImport(target.app, target.downloadId, choices),
      { done: (o) => ({ text: "Imported", detail: o.message || undefined }), failText: "Not imported", refresh: ["tickets", "all"], reward: true });
    if (out) { setDone(out.message || "Imported."); onDone?.(); }
  };
  const useSeries = async (s: AppArrItem) => {
    setFinding(null);
    setSeries(s);
    setPicks({});
    setEps((await client.arrEpisodes(s.id).catch(() => ({ rows: [] }))).rows);
  };
  const episodeOptions = episodes.map((e) => ({ value: String(e.id), label: `${e.label} · ${e.title || "TBA"}${e.hasFile ? " (has a file)" : ""}` }));
  const owner = series ?? p?.series;

  return (
    <View style={styles.box} accessibilityLabel={`${app} won’t import this by itself`}>
      <Text variant="label" style={styles.head}>⚠︎ {app} won’t import this by itself</Text>
      {preview.error ? <Text variant="meta">{preview.error.message}</Text> : !p ? <Text variant="meta">Looking inside…</Text> : (
        <>
          {p.messages.map((m) => <Text key={m} variant="meta" style={styles.why}>{app} says: “{m}”</Text>)}
          <Text variant="body">Look before you import. Usually it’s fine (a name {app} couldn’t match), but a blocked import can be the wrong episode, the wrong film, or something that shouldn’t be there. Check each file is what {app} thinks it is.</Text>
          {p.warnings.map((w) => <Text key={w} variant="label" style={styles.warn}>⚠︎ {w}</Text>)}
          {tv ? (
            <View style={styles.owner}>
              <Text variant="label">Show: {owner?.title ?? "none"}{owner?.year ? ` (${owner.year})` : ""}</Text>
              <Button kind="secondary" label="Wrong show?" onPress={() => setFinding(finding === "series" ? null : "series")} style={styles.start} />
              {finding === "series" ? <ArrFinder app="sonarr" onPick={(s) => void useSeries(s)} /> : null}
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
                  {tv ? (
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
              {blocker ? <Text variant="label" style={styles.warn}>{blocker}</Text> : null}
              <HoldButton label="Import it" stages={STAGES} bail="Chickened out. Fair. 🐔" disabled={!!busy || !!blocker}
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
  const found = useQuery({
    queryKey: ["arr-library", app, q.trim()], enabled: q.trim().length >= 2,
    queryFn: ({ signal }) => client.arrLibrary(app, q.trim(), signal),
  });
  return (
    <View style={styles.finder}>
      <TextInput value={q} onChangeText={setQ} autoFocus placeholder={app === "sonarr" ? "Find the show in Sonarr" : "Find the film in Radarr"}
        placeholderTextColor={color.faint} accessibilityLabel={app === "sonarr" ? "Find the show in Sonarr" : "Find the film in Radarr"} style={styles.input} />
      {found.data ? (found.data.rows.length ? found.data.rows.map((r) => (
        <Button key={r.id} kind="secondary" label={`${r.title}${r.year ? ` (${r.year})` : ""}`} onPress={() => onPick(r)} />
      )) : <Text variant="meta">Nothing in {app === "sonarr" ? "Sonarr" : "Radarr"} by that name.</Text>) : null}
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
