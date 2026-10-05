// One request, start to finish: where it is on its journey, live progress, season by
// season, the admin's note, and "Something wrong?" for when it's stuck.
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRequest } from "../../api/schemas";
import { useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { formatSlot, since } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { Ambient, GlassFill, glass } from "../../ui/Glass";
import { SeasonsBox, StageBox } from "./StageBox";

const KIND: Record<string, string> = { movie: "Film", tv: "TV", audiobook: "Audiobook", ebook: "Ebook" };
const HELP_REASON: Record<string, string> = {
  stuck: "stuck downloading", notfound: "can’t be found", quality: "wrong version or quality",
  episodes: "wrong or missing episodes", playback: "won’t play", other: "something else",
};


export function seasonsText(s: AppRequest["seasons"]) {
  if (s === "all") return "All seasons";
  if (s === "latest") return "Latest season + new episodes";
  return s?.length ? (s.length === 1 ? `Season ${s[0]}` : `Seasons ${s.join(", ")}`) : null;
}

export function RequestDetail() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const heading = useFocusHere();
  const insets = useSafeAreaInsets();
  const { data, error, refetch } = useRequests();
  const r = data?.find((x) => String(x.slot) === slot);

  if (!r) {
    return (
      <View style={styles.page}>
        <BackHeader />
        <View style={styles.pad}>
          {data || error ? (
            <>
              <Text variant="title" accessibilityRole="alert">{error ? "Couldn’t load this request." : "That request isn’t yours, or it’s gone."}</Text>
              {error ? <Button kind="secondary" label="Try again" onPress={() => void refetch()} style={styles.start} /> : null}
            </>
          ) : <View style={styles.skeleton} accessibilityLabel="Loading" accessible />}
        </View>
      </View>
    );
  }

  const ended = r.stage === "declined" || r.stage === "closed";
  const book = r.title.kind === "audiobook" || r.title.kind === "ebook";
  const canAsk = !!r.id && !ended && !r.help;

  return (
    <View style={styles.page}>
      <Ambient />
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.head}>
          <Poster poster={r.title.poster} title={r.title.title} id={r.title.id} size="w342" style={styles.poster} />
          <View style={styles.headText}>
            <Text variant="eyebrow">{[`No. ${formatSlot(r.slot)}`, KIND[r.title.kind], r.format && book ? r.format : null].filter(Boolean).join(" · ")}</Text>
            <Text ref={heading} style={styles.name} accessibilityRole="header">{r.title.title}</Text>
            {seasonsText(r.seasons) ? <Text variant="meta">{seasonsText(r.seasons)}</Text> : null}
          </View>
        </View>

        <StageBox r={r} />
        <SeasonsBox r={r} />

        {r.note ? (
          <View style={[styles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="eyebrow">From the admins</Text>
            <Text variant="body" style={styles.ink}>“{r.note}”</Text>
          </View>
        ) : null}

        <Text variant="meta">Requested {since(r.requestedAt)} · updated {since(r.updatedAt)}</Text>

        {r.help ? (
          <View style={[styles.box, glass.surface]} accessibilityRole="summary">
            <GlassFill radius={radius.m} />
            <Text variant="label">Help asked: {HELP_REASON[r.help.reason] ?? r.help.reason.toLowerCase()}.</Text>
            <Text variant="meta">An admin will get back to you.</Text>
          </View>
        ) : canAsk ? (
          <Button kind="secondary" label="Something wrong? Ask for help" style={styles.start}
            onPress={() => router.push({ pathname: "/help/[slot]", params: { slot: String(r.slot) } })} />
        ) : null}
      </ScrollView>
      <BackHeader overlay />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  pad: { paddingHorizontal: space.l, gap: space.l },
  start: { alignSelf: "flex-start" },
  head: { flexDirection: "row", alignItems: "flex-end", gap: space.l },
  poster: { width: 104 },
  headText: { flex: 1, gap: space.xs },
  name: { fontFamily: font.black, fontSize: 24, lineHeight: 28, color: color.ink },
  box: { gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  ink: { color: color.ink },
  skeleton: { height: 160, borderRadius: radius.m, backgroundColor: color.panel },
});
