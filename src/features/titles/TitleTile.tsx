// A poster with its name and one line under it, in a grid. Opens the title page when
// there is one (films and shows from TMDB, books from Open Library; not Plex-only items).
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { AppTitle } from "../../api/schemas";
import { Poster } from "../../ui/Poster";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { useLargeText } from "../../ui/useColumns";
import { color, space } from "../../ui/theme";

const hasPage = (t: Pick<AppTitle, "id">) => !!t.id && !t.id.startsWith("plex:");

export function TitleTile({ title: t, width, meta, highlight }: { title: AppTitle; width: number; meta?: string | null; highlight?: boolean }) {
  const large = useLargeText();
  const label = `${t.title}${t.year ? `, ${t.year}` : ""}${meta ? `. ${meta}` : ""}`;
  const body = (
    <>
      <Poster poster={t.poster} title={t.title} id={t.id} />
      <Text variant="label" numberOfLines={large ? undefined : 2} style={styles.name}>{t.title}</Text>
      {meta ? <Text variant="meta" numberOfLines={large ? undefined : 1} style={highlight ? styles.highlight : undefined}>{meta}</Text> : null}
    </>
  );
  if (!hasPage(t)) return <View style={{ width }} accessible accessibilityLabel={label}>{body}</View>;
  return (
    <PressableScale
      haptic="none"
      onPress={() => router.push({ pathname: "/title/[kind]/[id]", params: { kind: t.kind, id: t.id } })}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width }}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  name: { marginTop: space.s, fontSize: 14, lineHeight: 18 },
  highlight: { color: color.screen },
});
