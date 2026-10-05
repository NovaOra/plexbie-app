// Where a request is on its way, as a box: the stage, live progress, the five steps, and
// season by season. The member's request page and an admin's (Manage → All requests) share it.
import { StyleSheet, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";
import type { AppRequest } from "../../api/schemas";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { GlassFill, glass } from "../../ui/Glass";
import { isLive, stageHelp, stageLabel } from "../requests/stage";

const EASE = cubicBezier(0.23, 1, 0.32, 1);

/** Where each stage sits on the way: asked, approved, on its way, being added, there. */
const STEP: Record<string, number> = {
  requested: 0, approved: 1, upcoming: 1, searching: 1, downloading: 2, unpacking: 2, importing: 3, available: 4,
};

const placeOf = (r: AppRequest) => (r.title.kind === "audiobook" || r.title.kind === "ebook" ? "Audiobookshelf" : "Plex");

export function StageBox({ r }: { r: AppRequest }) {
  const reduced = useReducedMotion();
  const live = isLive(r.stage);
  const ended = r.stage === "declined" || r.stage === "closed";
  const step = STEP[r.stage];
  const percent = typeof r.progress?.percent === "number" ? Math.max(0, Math.min(100, r.progress.percent)) : null;
  const place = placeOf(r);
  // The website's words for the same steps (its downloading and unpacking are one step here).
  const steps = ["Requested", "Approved", "Downloading", `Adding to ${place}`, `On ${place}`];
  return (
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
  );
}

export function SeasonsBox({ r }: { r: AppRequest }) {
  const place = placeOf(r);
  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
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
});
