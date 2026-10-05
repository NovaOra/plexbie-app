// Who's watching right now: poster, who and on what, the title, and how far in.
import { StyleSheet, View } from "react-native";
import type { AppCommunity } from "../../api/schemas";
import { Button } from "../../ui/Button";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { useLargeText } from "../../ui/useColumns";
import { color, radius, space } from "../../ui/theme";
import { GlassFill, glass } from "../../ui/Glass";

export function OnAirList({ community, failed, retry, limit }: {
  community?: AppCommunity; failed: boolean; retry: () => void; limit?: number;
}) {
  const large = useLargeText();
  if (failed && !community) {
    return (
      <>
        <Text variant="body">Couldn’t see who’s watching right now.</Text>
        <Button kind="secondary" label="Try again" onPress={retry} style={styles.start} />
      </>
    );
  }
  if (!community) return <View style={styles.skeleton} />;
  const rows = community.onAir.slice(0, limit);
  if (!rows.length) return <Text variant="body">Nobody’s watching right now.</Text>;
  return (
    <>
      {rows.map((o) => {
        const pct = Math.round(Math.max(0, Math.min(1, o.progress)) * 100);
        return (
          <View key={o.member + o.title} style={[styles.row, glass.surface]} accessible
            accessibilityLabel={`${o.member} is watching ${o.title}${o.subtitle ? `, ${o.subtitle}` : ""}${o.device ? ` on ${o.device}` : ""}, ${pct} percent through`}>
            <GlassFill radius={radius.m} />
            <Poster poster={o.poster} title={o.title} id={o.member + o.title} style={styles.poster} />
            <View style={styles.body}>
              <Text variant="meta" numberOfLines={large ? undefined : 1}>{o.member}{o.device ? `, on ${o.device}` : ""}</Text>
              <Text variant="title" numberOfLines={large ? undefined : 1}>{o.title}</Text>
              {o.subtitle ? <Text variant="meta" numberOfLines={large ? undefined : 1}>{o.subtitle}</Text> : null}
              <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  skeleton: { height: 96, borderRadius: radius.m, backgroundColor: color.panel },
  row: { flexDirection: "row", gap: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  poster: { width: 52 },
  body: { flex: 1, gap: 2, justifyContent: "center", minWidth: 0 },
  track: { height: 4, borderRadius: 2, backgroundColor: color.rule, overflow: "hidden", marginTop: space.xs },
  fill: { height: 4, borderRadius: 2, backgroundColor: color.tally },
});
