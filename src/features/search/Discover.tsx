// The Request tab under the search box: three small dropdowns (Type, Language, Genre),
// then either the search's results, grouped (films, shows, books), or things to browse
// from Seerr (TMDB): Trending, Popular, Coming soon and Top rated, films and shows
// together. The same as the website's Request page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { checkSignedOut } from "../../api/query";
import type { AppDiscover, AppTitle } from "../../api/schemas";
import { useApi, useSession } from "../../auth/session";
import { announce, useAnnounce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { PickerPill } from "../../ui/PickerSheet";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { useLargeText } from "../../ui/useColumns";
import { color, radius, space } from "../../ui/theme";
import { TitleTile } from "../titles/TitleTile";

export type RequestType = "all" | "movie" | "tv" | "book";
const TYPES: [RequestType, string][] = [["all", "Everything"], ["movie", "Films"], ["tv", "Shows"], ["book", "Books"]];
const NOUN = { movie: "films", tv: "shows" } as const;

export function tileMeta(t: AppTitle) {
  return t.availability === "blocked" ? "Not available"
    : t.availability === "available" ? "On Plex"
    : t.yourRequest ? "You asked"
    : t.availability === "requested" ? "Requested"
    : [t.author, t.year].filter(Boolean).join(", ");
}

function shelfHeading(key: string, kind: "movie" | "tv") {
  const n = NOUN[kind];
  const by: Record<string, string> = {
    trending: `Trending ${n}`, popular: `Popular ${n}`, top: `Top rated ${n}`, upcoming: `${n[0].toUpperCase()}${n.slice(1)} coming soon`,
  };
  return by[key] ?? key;
}

function useServer() {
  const { state } = useSession();
  return state.phase === "signedIn" ? state.server : "";
}

/** A row of posters to scroll sideways, with a More tile at the end when there's more. */
export function Rail({ heading, titles, onMore, busy }: { heading: string; titles: AppTitle[]; onMore?: () => void; busy?: boolean }) {
  const large = useLargeText();
  const width = large ? 160 : 112;   // as Home's Just arrived
  if (!titles.length) return null;
  return (
    <View style={styles.rail}>
      <Text variant="eyebrow" accessibilityRole="header">{heading}</Text>
      <FlatList
        horizontal
        data={titles}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.railList}
        renderItem={({ item }) => <TitleTile title={item} width={width} meta={tileMeta(item)} highlight={item.availability === "available"} />}
        ListFooterComponent={onMore ? (
          <PressableScale onPress={onMore} disabled={busy} accessibilityRole="button" accessibilityLabel={`More ${heading.toLowerCase()}`}
            accessibilityState={{ busy: !!busy }}
            style={[styles.more, { width }]}>
            <Text variant="label" style={styles.moreText}>{busy ? "Loading…" : "More"}</Text>
          </PressableScale>
        ) : null}
      />
    </View>
  );
}

/** One shelf, which loads more of itself a page at a time. A page that fails leaves More
 *  in place for another go; one that loads tells a screen reader how many titles it added.
 *  A page still loading when the shelf goes (a search typed meanwhile) is dropped quietly. */
function Shelf({ kind, shelfKey, heading, first, firstMore }: { kind: "movie" | "tv"; shelfKey: string; heading: string; first: AppTitle[]; firstMore: boolean }) {
  const client = useApi();
  const toast = useToast();
  const [titles, setTitles] = useState(first);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(firstMore);
  const [busy, setBusy] = useState(false);
  const loading = useRef<AbortController | null>(null);
  useEffect(() => { setTitles(first); setPage(1); setMore(firstMore); }, [first, firstMore]);
  useEffect(() => () => loading.current?.abort(), []);
  const next = async () => {
    const ac = new AbortController();
    loading.current = ac;
    setBusy(true);
    try {
      const got = await client.shelf(kind, shelfKey, page + 1, ac.signal);
      if (ac.signal.aborted) return;
      const added = got.titles.filter((t) => !titles.some((h) => h.id === t.id)).length;
      setTitles((had) => [...had, ...got.titles.filter((t) => !had.some((h) => h.id === t.id))]);
      setPage(got.page);
      setMore(got.more);
      announce(added ? `${added} more ${heading.toLowerCase()}` : got.more ? null : `No more ${heading.toLowerCase()}`);
    } catch (e) {
      if (ac.signal.aborted) return;
      checkSignedOut(e);
      toast({ tone: "error", text: "Couldn’t load more just now", detail: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return <Rail heading={heading} titles={titles} onMore={more ? () => void next() : undefined} busy={busy} />;
}

function GenreShelf({ kind, id, heading }: { kind: "movie" | "tv"; id: number; heading: string }) {
  const client = useApi();
  const server = useServer();
  const page = useQuery({
    queryKey: ["shelf", server, kind, `genre-${id}`],
    queryFn: ({ signal }) => client.shelf(kind, `genre-${id}`, 1, signal),
    staleTime: 30 * 60_000,
  });
  if (page.isPending) return <View style={styles.skeleton} />;
  if (!page.data) return <Text variant="body">Couldn’t load {heading.toLowerCase()} just now.</Text>;
  if (!page.data.titles.length) return <Text variant="meta">No {heading.toLowerCase()} to show right now.</Text>;
  return <Shelf kind={kind} shelfKey={`genre-${id}`} heading={heading} first={page.data.titles} firstMore={page.data.more} />;
}

export function RequestBody({ q, type, setType }: { q: string; type: RequestType; setType: (t: RequestType) => void }) {
  const client = useApi();
  const server = useServer();
  const qc = useQueryClient();
  const toast = useToast();
  const kinds: ("movie" | "tv")[] = type === "movie" ? ["movie"] : type === "tv" ? ["tv"] : type === "all" ? ["movie", "tv"] : [];
  const browsing = !q && kinds.length > 0;
  const prefs = useQuery({ queryKey: ["prefs", server], queryFn: ({ signal }) => client.prefs(signal), staleTime: 30 * 60_000 });
  const films = useQuery({ queryKey: ["discover", server, "movie"], queryFn: ({ signal }) => client.discover("movie", signal),
    staleTime: 30 * 60_000, enabled: browsing && kinds.includes("movie") });
  const shows = useQuery({ queryKey: ["discover", server, "tv"], queryFn: ({ signal }) => client.discover("tv", signal),
    staleTime: 30 * 60_000, enabled: browsing && kinds.includes("tv") });
  const results = useQuery({ queryKey: ["search-all", server, q], queryFn: ({ signal }) => client.searchAll(q, signal),
    enabled: q.length > 0, staleTime: 5 * 60_000 });
  const [genre, setGenre] = useState("");
  const chosen = prefs.data?.languages ?? [];
  const options = prefs.data?.languageOptions ?? [];
  const byKind: Record<"movie" | "tv", AppDiscover | undefined> = { movie: films.data, tv: shows.data };
  const genres = [...new Set(kinds.flatMap((k) => byKind[k]?.genres.map((g) => g.name) ?? []))].sort();
  useEffect(() => { if (genre && genres.length && !genres.includes(genre)) setGenre(""); }, [genre, genres]);

  // A search's results, grouped by type; a screen reader hears how many once it settles.
  const r = results.data;
  const groups: [RequestType, string, AppTitle[]][] = [["movie", "Films", r?.movie ?? []], ["tv", "Shows", r?.tv ?? []], ["book", "Books", r?.book ?? []]];
  const shown = groups.filter(([k]) => type === "all" || type === k);
  const total = shown.reduce((n, [, , t]) => n + t.length, 0);
  const inType = type === "all" ? "" : TYPES.find(([t]) => t === type)?.[1].toLowerCase() ?? "";
  const noun = inType ? inType.slice(0, -1) : "result";
  useAnnounce(!q || !r || results.error ? null
    : total ? `${total} ${noun}${total === 1 ? "" : "s"} for “${q}”` : `Nothing matched “${q}”${inType ? ` in ${inType}` : ""}`);

  // Kept with their account (the website shows the same), then the shelves load again. When
  // the save fails, reading the prefs back puts the dropdown back to what was saved.
  const pickLanguages = async (next: string[]) => {
    qc.setQueryData(["prefs", server], (d: typeof prefs.data) => (d ? { ...d, languages: next } : d));
    try {
      await client.saveLanguages(next);
    } catch (e) {
      checkSignedOut(e);
      toast({ tone: "error", text: "Couldn’t save languages", detail: e instanceof Error ? e.message : undefined });
    } finally {
      await qc.invalidateQueries({ predicate: (x) => ["prefs", "discover", "shelf"].includes(String(x.queryKey[0])) });
    }
  };
  const languageLabel = !chosen.length ? "Every language"
    : chosen.length <= 2 ? chosen.map((c) => options.find((o) => o.code === c)?.name ?? c).join(", ") : `${chosen.length} languages`;

  const bar = (
    <View style={styles.bar}>
      <PickerPill title="Type" label={TYPES.find(([t]) => t === type)?.[1] ?? "Everything"} value={type}
        options={TYPES.map(([value, label]) => ({ value, label }))} onChange={(v) => setType(v as RequestType)} />
      {browsing && options.length ? (
        <PickerPill title="Language" label={languageLabel} value={chosen} multiple
          options={[{ value: "", label: "Every language" }, ...options.map((o) => ({ value: o.code, label: o.name }))]}
          onChange={(v) => void pickLanguages(v as string[])} />
      ) : null}
      {browsing && genres.length ? (
        <PickerPill title="Genre" label={genre || "Any genre"} value={genre}
          options={[{ value: "", label: "Any genre" }, ...genres.map((g) => ({ value: g, label: g }))]} onChange={(v) => setGenre(v as string)} />
      ) : null}
    </View>
  );

  if (q) {
    return (
      <View style={styles.stack}>
        {bar}
        {results.error ? (
          <>
            <Text variant="body">Search didn’t answer just now.</Text>
            <Button kind="secondary" label="Try again" onPress={() => void results.refetch()} style={styles.start} />
          </>
        ) : results.isPending ? <View style={styles.skeleton} />
        : total ? shown.map(([k, label, titles]) => <Rail key={k} heading={`${label} (${titles.length})`} titles={titles} />)
        : <Text variant="body">Nothing matched “{q}”{inType ? ` in ${inType}` : ""}. Check the spelling{inType ? ", or set Type to Everything" : ""}.</Text>}
      </View>
    );
  }

  if (!kinds.length) {
    return (
      <View style={styles.stack}>
        {bar}
        <Text variant="body">Type a title or an author to find a book. You pick audiobook or ebook on its page.</Text>
      </View>
    );
  }

  const queries = kinds.map((k) => (k === "movie" ? films : shows));
  const keys = ["trending", "popular", "upcoming", "top"];
  return (
    <View style={styles.stack}>
      {bar}
      <Text variant="meta">From TMDB through Seerr{chosen.length ? ", in the languages you picked" : ", worldwide"}.</Text>
      {queries.some((x) => x.isPending) ? <><View style={styles.skeleton} /><View style={styles.skeleton} /></>
      : queries.every((x) => x.error) ? (
        <>
          <Text variant="body">Couldn’t load what’s trending just now.</Text>
          <Button kind="secondary" label="Try again" onPress={() => queries.forEach((x) => void x.refetch())} style={styles.start} />
        </>
      ) : genre ? kinds.map((k) => {
        const g = byKind[k]?.genres.find((x) => x.name === genre);
        return g ? <GenreShelf key={k} kind={k} id={g.id} heading={`${genre} ${NOUN[k]}`} /> : null;
      })
      : keys.flatMap((key) => kinds.map((k) => {
        const s = byKind[k]?.shelves.find((x) => x.key === key);
        return s ? <Shelf key={`${k}:${key}`} kind={k} shelfKey={key} heading={shelfHeading(key, k)} first={s.titles} firstMore={s.more} /> : null;
      }))}
    </View>
  );
}

/** On a title's page: Seerr's recommendations for it, when it has some. */
export function MoreLikeThis({ kind, id }: { kind: "movie" | "tv"; id: string }) {
  const client = useApi();
  const server = useServer();
  const s = useQuery({ queryKey: ["similar", server, kind, id], queryFn: ({ signal }) => client.similar(kind, id, signal), staleTime: 30 * 60_000 });
  if (!s.data?.length) return null;
  return <Rail heading="More like this" titles={s.data} />;
}

const styles = StyleSheet.create({
  stack: { gap: space.xl, paddingBottom: space.l },
  start: { alignSelf: "flex-start" },
  bar: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: -space.s },
  rail: { gap: space.s },
  bleed: { marginHorizontal: -space.l },
  railList: { paddingHorizontal: space.l, gap: space.m },
  more: { aspectRatio: 2 / 3, borderRadius: radius.s, borderWidth: 1, borderStyle: "dashed", borderColor: color.rule, backgroundColor: color.panel,
    alignItems: "center", justifyContent: "center" },
  moreText: { color: color.screen },
  skeleton: { height: 220, borderRadius: radius.m, backgroundColor: color.panel },
});
