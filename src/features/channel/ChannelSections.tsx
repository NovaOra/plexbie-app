// The channel's sections, on Home: the all-time board (top three are safe from cleanup,
// streaks beside each name) and your own figures, watch parties included.
import { useQuery } from "@tanstack/react-query";
import { Platform, StyleSheet, View } from "react-native";
import type { AppCommunity } from "../../api/schemas";
import { useApi, useServer } from "../../auth/session";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { useMe } from "../me/useMe";
import { since } from "../requests/stage";
import { GlassFill, glass } from "../../ui/Glass";

export function Board({ community, failed, retry }: { community?: AppCommunity; failed: boolean; retry: () => void }) {
  const me = useMe();
  const myName = me.data?.user.name;
  const board = community?.leaderboard ?? [];
  return (
    <View style={styles.stack}>
      <Text variant="meta">All-time watch time, watch parties included. The top three are never removed for inactivity.</Text>
      {failed && !community ? (
        <>
          <Text variant="body">Couldn’t load the board just now.</Text>
          <Button kind="secondary" label="Try again" onPress={retry} style={styles.start} />
        </>
      ) : !community ? <View style={[styles.skeleton, { height: 240 }]} />
      : !board.length ? <Text variant="body">No watch time recorded yet. It starts counting as soon as someone presses play.</Text>
      : (
        <View style={styles.board} accessibilityRole="list">
          {board.map((p, i) => {
            const mine = !!myName && p.name === myName;
            return (
              <View key={p.name} style={[styles.rank, glass.surface, i < 3 && styles.rankTop, mine && styles.rankYou]} accessible
                accessibilityLabel={`${i + 1}. ${p.name}${mine ? ", you" : ""}, ${Math.round(p.hours)} hours${p.streak > 0 ? `, ${p.streak} day streak` : ""}${i < 3 ? ", safe from cleanup" : ""}`}>
                <GlassFill radius={radius.m} />
                <Text style={[styles.rankN, i < 3 && styles.rankNTop]}>{i + 1}</Text>
                <Text variant="label" style={styles.rankName} numberOfLines={1}>{p.name}{mine ? " (you)" : ""}</Text>
                {p.streak > 0 ? <Text variant="meta" style={styles.streak}>{p.streak} d</Text> : null}
                <Text style={styles.hours}>{Math.round(p.hours).toLocaleString()} h</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function YouFigures({ you }: { you: NonNullable<AppCommunity["you"]> }) {
  const client = useApi();
  const server = useServer();
  const party = useQuery({ queryKey: ["watchparty", server], queryFn: ({ signal }) => client.watchparty(signal), staleTime: 5 * 60_000 });
  return (
    <View style={styles.stack}>
      <View style={styles.figures}>
        <Figure value={`${Math.round(you.hours).toLocaleString()} h`} label="watched in total" />
        <Figure value={you.rank ? `#${you.rank}` : "Unranked"} label="on the board" />
        <Figure value={`${you.streak}`} label={`day streak, best ${you.longestStreak}`} hot={you.streak > 0} />
        <Figure
          value={`${Math.round((you.watchPartyMinutes / 60) * 10) / 10} h`}
          label={`watch-party credit${party.data?.sessions ? `, ${party.data.sessions} session${party.data.sessions === 1 ? "" : "s"}` : ""}${party.data?.last ? `, last ${since(party.data.last)}` : ""}`}
        />
      </View>
      <View style={[styles.notice, glass.surface]}>
        <GlassFill radius={radius.m} />
        <Text variant="title">{you.topThree ? "Safe from cleanup" : you.daysIdle === 0 ? "Active today" : `Idle for ${you.daysIdle} days`}</Text>
        <Text variant="meta">
          {you.topThree ? "Top-three watchers are skipped by the inactivity check."
            : `Accounts with nothing watched for ${you.removalAfterDays} days are removed from Plex. Watching anything resets it.`}
        </Text>
      </View>
    </View>
  );
}

function Figure({ value, label, hot }: { value: string; label: string; hot?: boolean }) {
  return (
    <View style={[styles.figure, glass.surface]} accessible accessibilityLabel={`${value}, ${label}`}>
      <GlassFill radius={radius.m} />
      <Text style={[styles.figureValue, hot && styles.hot]} maxFontSizeMultiplier={1.4}>{value}</Text>
      <Text variant="meta">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.m },
  start: { alignSelf: "flex-start" },
  skeleton: { borderRadius: radius.m, backgroundColor: color.panel },
  board: { gap: space.xs },
  rank: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 48, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: color.panel },
  rankTop: { borderWidth: StyleSheet.hairlineWidth, borderColor: color.screenDeep },
  rankYou: { backgroundColor: Platform.OS === "ios" ? "rgba(255, 209, 228, 0.10)" : color.panelRaised },
  rankN: { minWidth: 24, fontFamily: font.bold, fontSize: 16, color: color.slateInk },
  rankNTop: { color: color.screen },
  rankName: { flex: 1 },
  streak: { color: color.tally },
  hours: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.m },
  figure: { flexGrow: 1, flexBasis: "45%", padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, gap: 2 },
  figureValue: { fontFamily: font.black, fontSize: 26, lineHeight: 30, color: color.screen },
  hot: { color: color.tally },
  notice: { gap: space.xs, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
});
