// Library: everything already on Plex (and the book shelf), by shelf, order and genre,
// picked from three small dropdowns like the Request page's. A virtualized poster grid;
// titles with a page open it.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppLibraryItem } from "../../api/schemas";
import { useApi, useSession } from "../../auth/session";
import { announce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { PickerPill } from "../../ui/PickerSheet";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { useColumns } from "../../ui/useColumns";
import { color, radius, space } from "../../ui/theme";
import { useStatus } from "../home/useHome";
import { since } from "../requests/stage";
import { TitleTile } from "../titles/TitleTile";
import { Ambient, TAB_BAR_CLEARANCE } from "../../ui/Glass";

type Shelf = "movie" | "tv" | "book";
type Sort = "added" | "az" | "year";
const SHELVES: [Shelf, string, string][] = [["movie", "Films", "movie"], ["tv", "TV", "show"], ["book", "Books", "book"]];
const SORTS: [Sort, string][] = [["added", "Recently added"], ["az", "A to Z"], ["year", "Newest release"]];
const GAP = space.m;

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = useColumns();
  const client = useApi();
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  const status = useStatus();
  const [shelf, setShelf] = useState<Shelf>("movie");
  const [sort, setSort] = useState<Sort>("added");
  const [genre, setGenre] = useState<string | null>(null);
  const items = useQuery({
    queryKey: ["library", server, shelf],
    queryFn: ({ signal }) => client.library(shelf, signal),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => { setPulling(true); try { await items.refetch(); } finally { setPulling(false); } }, [items]);

  const current = items.isPlaceholderData ? undefined : items.data;
  const genres = useMemo(() => {
    const all = new Set<string>();
    for (const t of current ?? []) for (const g of t.genres ?? []) all.add(g);
    return [...all].sort();
  }, [current]);
  const shown = useMemo(() => {
    const list = (current ?? []).filter((t) => !genre || t.genres?.includes(genre));
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "year") list.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    else list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    return list;
  }, [current, genre, sort]);
  const total = current ? `${shown.length.toLocaleString()} ${shown.length === 1 ? "title" : "titles"}` : null;
  // After a pick in a dropdown, a screen reader hears how many titles that leaves (opening
  // the screen doesn't). A new shelf says it once its titles are in.
  const picked = useRef(false);
  useEffect(() => { if (picked.current) announce(total); }, [total, shelf, sort, genre]);

  const itemWidth = (width - space.l * 2 - GAP * (columns - 1)) / columns;
  const count = (lib: string) => status.data?.libraries.filter((l) => l.kind === lib).reduce((n, l) => n + l.count, 0);
  /** "Films · 1,284": the shelf, and how much is on it. */
  const shelfLabel = (id: Shelf) => {
    const [, label, lib] = SHELVES.find(([s]) => s === id)!;
    const n = count(lib);
    return n ? `${label} · ${n.toLocaleString()}` : label;
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.l }]}>
      <ScreenTitle>Library</ScreenTitle>
      <Text variant="body">Everything already on Plex. Open anything to see its details.</Text>
      <View style={styles.bar}>
        <PickerPill title="Shelf" label={shelfLabel(shelf)} value={shelf}
          options={SHELVES.map(([id]) => ({ value: id, label: shelfLabel(id) }))}
          onChange={(v) => { picked.current = true; setShelf(v as Shelf); setGenre(null); }} />
        <PickerPill title="Sort" label={SORTS.find(([id]) => id === sort)?.[1] ?? "Recently added"} value={sort}
          options={SORTS.map(([value, label]) => ({ value, label }))} onChange={(v) => { picked.current = true; setSort(v as Sort); }} />
        {genres.length > 1 ? (
          <PickerPill title="Genre" label={genre ?? "Any genre"} value={genre ?? ""}
            options={[{ value: "", label: "Any genre" }, ...genres.map((g) => ({ value: g, label: g }))]}
            onChange={(v) => { picked.current = true; setGenre((v as string) || null); }} />
        ) : null}
      </View>
      {total ? <Text variant="eyebrow" style={styles.total}>{total}</Text> : null}
    </View>
  );

  const empty = items.error && !current ? (
    <View style={styles.message}>
      <Text variant="body">Couldn’t load this shelf from Plex. Nothing is lost.</Text>
      <Button kind="secondary" label="Try again" onPress={() => void items.refetch()} style={styles.start} />
    </View>
  ) : !current ? (
    <View style={styles.skeletons}>{Array.from({ length: columns * 3 }, (_, i) => <View key={i} style={[styles.skeleton, { width: itemWidth }]} />)}</View>
  ) : (
    <Text variant="body" style={styles.message}>
      {genre ? "Nothing on this shelf matches. Try another genre, or request it." : "Nothing on this shelf yet. Ask for something and it lands here."}
    </Text>
  );

  return (
    <View style={styles.page}>
      <Ambient />
      <FlatList
        data={current ? shown : []}
        key={columns}
        numColumns={columns}
        keyExtractor={(t: AppLibraryItem) => `${t.kind}:${t.id}`}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl + TAB_BAR_CLEARANCE }]}
        initialNumToRender={12}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.screen} colors={[color.onScreen]} progressBackgroundColor={color.screen} />}
        renderItem={({ item }) => (
          <TitleTile title={item} width={itemWidth} meta={sort === "added" && item.addedAt ? `Added ${since(item.addedAt)}` : item.year || null} />
        )}
      />
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  list: { paddingHorizontal: space.l },
  header: { gap: space.m, paddingBottom: space.m },
  bar: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  total: { marginTop: space.xs },
  gridRow: { gap: GAP, marginBottom: space.l },
  start: { alignSelf: "flex-start" },
  message: { paddingVertical: space.l, gap: space.m },
  skeletons: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  skeleton: { aspectRatio: 2 / 3, borderRadius: radius.s, backgroundColor: color.panel },
});
