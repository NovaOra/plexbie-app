// One request, start to finish: where it is on its journey, live progress, season by
// season, the admin's note, and "Something wrong?" for when it's stuck.
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRequest } from "../../api/schemas";
import { useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Poster } from "../../ui/Poster";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { formatSlot, isLive, since, stageHelp, stageLabel } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { Ambient, GlassFill, glass } from "../../ui/Glass";

const EASE = cubicBezier(0.23, 1, 0.32, 1);
const KIND: Record<string, string> = { movie: "Film", tv: "TV", audiobook: "Audiobook", ebook: "Ebook" };
const HELP_REASON: Record<string, string> = {
  stuck: "stuck downloading", notfound: "can’t be found", quality: "wrong version or quality",
  episodes: "wrong or missing episodes", playback: "won’t play", other: "something else",
};

/** Where each stage sits on the way: asked, approved, on its way, being added, there. */
const STEP: Record<string, number> = {
  requested: 0, approved: 1, upcoming: 1, searching: 1, downloading: 2, unpacking: 2, importing: 3, available: 4,
};

export function seasonsText(s: AppRequest["seasons"]) {
  if (s === "all") return "All seasons";
  if (s === "latest") return "Latest season + new episodes";
  return s?.length ? (s.length === 1 ? `Season ${s[0]}` : `Seasons ${s.join(", ")}`) : null;
}

export function RequestDetail() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const reduced = useReducedMotion();
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

  const live = isLive(r.stage);
  const ended = r.stage === "declined" || r.stage === "closed";
  const step = STEP[r.stage];
  const percent = typeof r.progress?.percent === "number" ? Math.max(0, Math.min(100, r.progress.percent)) : null;
  const book = r.title.kind === "audiobook" || r.title.kind === "ebook";
  const place = book ? "Audiobookshelf" : "Plex";
  // The website's words for the same steps (its downloading and unpacking are one step here).
  const steps = ["Requested", "Approved", "Downloading", `Adding to ${place}`, `On ${place}`];
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

        <View style={[styles.box, glass.surface, live && styles.boxLive]} accessible accessibilityLabel={[
          `${stageLabel(r.stage, r.title.kind)}. ${r.progress?.detail || stageHelp(r.stage, r.title.kind, r.format)}`,
          live && percent !== null ? `${percent} percent` : null,
          r.progress?.problem || null,
          step !== undefined ? `Step ${step + 1} of ${steps.length}: ${steps[step]}` : null,
        ].filter(Boolean).join(". ")}>
          <GlassFill radius={radius.m} />
          <View style={styles.strap}>
            <View style={[styles.tally, live && styles.tallyLive, r.stage === "available" && styles.tallyDone, ended && styles.tallyMuted]} />
            <Text style={[styles.stage, r.stage === "available" && styles.done]}>{stageLabel(r.stage, r.title.kind)}</Text>
          </View>
          <Text variant="body" style={styles.ink}>{r.progress?.detail || stageHelp(r.stage, r.title.kind, r.format)}</Text>
          {live && percent !== null ? (
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: `${percent}%`, transitionProperty: "width", transitionDuration: reduced ? 0 : 600, transitionTimingFunction: EASE }]} />
            </View>
          ) : null}
          {r.progress?.problem ? <Text variant="meta" style={styles.problem}>{r.progress.problem}</Text> : null}
          {step !== undefined ? (
            <View style={styles.journey}>
              {steps.map((label, i) => (
                <View key={label} style={styles.stepRow}>
                  {/* Not colour alone: done steps carry a tick, the current one says "now". */}
                  <View style={[styles.stepDot, i < step && styles.stepPast, i === step && styles.stepNow, i === step && live && styles.stepLive]}>
                    {i < step ? <Text style={styles.tick} maxFontSizeMultiplier={1.2}>✓</Text> : null}
                  </View>
                  <Text variant="meta" style={[i === step && styles.now, i > step && styles.later]}>{label}{i === step ? " · now" : ""}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {r.progress?.seasons?.length ? (
          <View style={[styles.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <Text variant="title" accessibilityRole="header">Season by season</Text>
            {r.progress.seasons.map((s) => (
              <View key={s.n} style={styles.seasonRow}>
                <Text variant="label">Season {s.n}</Text>
                <Text variant="meta" style={s.total && s.have >= s.total ? styles.done : undefined}>
                  {s.total ? `${s.have} of ${s.total} on ${place}` : `${s.have} on ${place}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

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
  boxLive: { borderColor: "rgba(255, 92, 147, 0.45)" },
  strap: { flexDirection: "row", alignItems: "center", gap: space.s },
  tally: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.slate },
  tallyLive: { backgroundColor: color.tally, shadowColor: color.tally, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  tallyDone: { backgroundColor: color.screen },
  tallyMuted: { backgroundColor: color.rule },
  stage: { fontFamily: font.bold, fontSize: 15, letterSpacing: 0.8, textTransform: "uppercase", color: color.ink },
  done: { color: color.screen },
  ink: { color: color.ink },
  later: { color: color.faint },
  track: { height: 8, borderRadius: 4, backgroundColor: color.rule, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: color.tally },
  problem: { color: color.tally },
  journey: { gap: space.s, marginTop: space.xs },
  stepRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  stepDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  tick: { fontSize: 10, lineHeight: 12, color: color.field, fontFamily: font.bold },
  now: { color: color.ink, fontFamily: font.semibold },
  stepPast: { backgroundColor: color.slate, borderColor: color.slate },
  stepNow: { backgroundColor: color.screen, borderColor: color.screen },
  stepLive: { backgroundColor: color.tally, borderColor: color.tally },
  seasonRow: { flexDirection: "row", justifyContent: "space-between", gap: space.m },
  skeleton: { height: 160, borderRadius: radius.m, backgroundColor: color.panel },
});
