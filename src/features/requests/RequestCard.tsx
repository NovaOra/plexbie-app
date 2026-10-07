import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import type { AppRequest } from "../../api/schemas";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { useLargeText } from "../../ui/useColumns";
import { color, EASE_OUT_CSS, font, radius, space } from "../../ui/theme";
import { KIND_LABEL, formatSlot, isLive, seasonsLabel, since, stageHelp, stageLabel } from "./stage";
import { GlassFill, glass } from "../../ui/Glass";
import { Poster } from "../../ui/Poster";

/** One request, as its "slot" on the schedule: number, poster, title, where it is now.
 *  On Manage → All requests it also says who asked (`by`) and why it looks stuck (`stuck`). */
export const RequestCard = memo(function RequestCard({ request: r, onPress, by, stuck }: {
  request: AppRequest; onPress?: (slot: number) => void; by?: string; stuck?: string[];
}) {
  const live = isLive(r.stage);
  const done = r.stage === "available";
  const muted = r.stage === "declined" || r.stage === "closed";
  const percent = typeof r.progress?.percent === "number" ? Math.max(0, Math.min(100, r.progress.percent)) : null;
  const detail = r.progress?.detail || stageHelp(r.stage, r.title.kind, r.format);
  const eyebrow = [`No. ${formatSlot(r.slot)}`, KIND_LABEL[r.title.kind], seasonsLabel(r.seasons)].filter(Boolean).join(" · ");

  const large = useLargeText();
  const reduced = useReducedMotion();
  const label = `${r.title.title}, request ${r.slot}${by ? `, asked by ${by}` : ""}. ${stuck?.length ? `Looks stuck: ${stuck.join(", ")}. ` : ""}${!by && r.help?.waiting && r.help.status !== "resolved" ? "An admin asked you something. " : ""}${stageLabel(r.stage, r.title.kind)}. ${/[.!?]$/.test(detail) ? detail : `${detail}.`}${percent !== null ? ` ${percent} percent.` : ""}`
    + `${r.note ? ` Note: ${r.note}.` : ""} Updated ${since(r.updatedAt)}.`;
  const card = (
    <View style={[styles.card, glass.surface, live && styles.cardLive, !!stuck?.length && styles.cardStuck]} accessible={!onPress} accessibilityLabel={onPress ? undefined : label}>
      <GlassFill radius={radius.m} />
      <Poster poster={r.title.poster} title={r.title.title} id={r.title.id} style={styles.poster} />
      <View style={styles.body}>
        <Text variant="eyebrow" numberOfLines={large ? undefined : 1}>{eyebrow}</Text>
        <Text variant="title" numberOfLines={large ? undefined : 2} style={muted && styles.mutedTitle}>{r.title.title}</Text>
        {by ? <Text variant="meta" numberOfLines={large ? undefined : 1}>Asked by {by}</Text> : null}
        <View style={styles.strap}>
          <View style={[styles.tally, live && styles.tallyLive, done && styles.tallyDone, muted && styles.tallyMuted]} />
          <Text style={[styles.stage, done && styles.stageDone, muted && styles.stageMuted]}>{stageLabel(r.stage, r.title.kind)}</Text>
        </View>
        <Text variant="meta" numberOfLines={large ? undefined : 2}>{detail}</Text>
        {stuck?.map((s) => <Text key={s} variant="meta" style={styles.stuck}>⚠︎ {s}</Text>)}
        {!by && r.help?.waiting && r.help.status !== "resolved" ? <Text variant="meta" style={styles.asked}>An admin asked you something</Text> : null}
        {live && percent !== null ? (
          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.fill, { width: `${percent}%`, transitionProperty: "width", transitionDuration: reduced ? 0 : 600, transitionTimingFunction: EASE_OUT_CSS }]} />
          </View>
        ) : null}
        {r.note ? <Text variant="meta" style={styles.note}>“{r.note}”</Text> : null}
        <Text variant="meta" style={styles.when}>Updated {since(r.updatedAt)}</Text>
      </View>
    </View>
  );
  if (!onPress) return card;
  return (
    <PressableScale haptic="none" onPress={() => onPress(r.slot)} accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint="Opens this request">
      {card}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", gap: space.m, padding: space.m,
    backgroundColor: color.panel, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule,
  },
  cardLive: { borderColor: "rgba(255, 92, 147, 0.45)" },
  cardStuck: { borderColor: "rgba(255, 92, 147, 0.7)" },
  stuck: { color: color.tally, fontFamily: font.semibold },
  asked: { color: color.screen, fontFamily: font.semibold },
  poster: { width: 72 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  mutedTitle: { color: color.slateInk },
  strap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  tally: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.slate },
  tallyLive: { backgroundColor: color.tally, shadowColor: color.tally, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  tallyDone: { backgroundColor: color.screen },
  tallyMuted: { backgroundColor: color.rule },
  stage: { fontFamily: font.bold, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", color: color.ink },
  stageDone: { color: color.screen },
  stageMuted: { color: color.slateInk },
  track: { height: 6, borderRadius: 3, backgroundColor: color.rule, overflow: "hidden", marginTop: 4 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: color.tally },
  note: { fontStyle: "italic" },
  when: { marginTop: 2, fontSize: 13 },
});
