// The sign-in screen's TV set, as the website's (web/src/pages/Landing.tsx): rabbit-ear
// antennae, a slate cabinet lit from above, a bezel round a lit pink screen (scanlines, a
// slow rolling line, a glass glare), domed knobs with grip ridges, a power light and a
// dotted grille at the side, and two feet with a shadow on the floor. Light from the
// screen spills onto the room behind it. Everything is drawn from Views and gradients
// (the app has no SVG). Idle motion is slow and stops under Reduce Motion.
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import { Text } from "../../ui/Text";
import { color, EASE_OUT, radius, space, tint } from "../../ui/theme";

// The cabinet lit from above and shaded below (DESIGN.md: slate lightened ~18%, darkened
// ~30%), the same as the Manage desk's monitors.
const CAB_TOP = "#8594b8";
const CAB_BOT = "#4a5574";
// A lit screen's centre: panel with a little of the screen's pink in it (slate-ink text on
// it still clears 4.5:1).
const GLOW = "#42415a";
const DARK_EDGE = "rgba(3, 6, 18, 0.45)";
const LIGHT_EDGE = "rgba(174, 184, 216, 0.45)";

/** Hidden from screen readers: drawing only. */
const DRAWING = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

/** A value that runs 0 → 1 (and back, with `bounce`) every `ms`, forever; still under Reduce Motion. */
function useIdle(ms: number, bounce = false) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) { t.set(0); return; }
    t.set(withRepeat(withTiming(1, { duration: ms, easing: bounce ? Easing.inOut(Easing.sin) : Easing.linear }), -1, bounce));
    return () => cancelAnimation(t);
  }, [reduced, t, ms, bounce]);
  return t;
}

/** The room behind the set: a pool of the screen's light, breathing slowly. */
export function RoomGlow() {
  const t = useIdle(5000, true);
  const breathe = useAnimatedStyle(() => ({ opacity: 0.75 + t.get() * 0.25 }));
  return (
    <Animated.View pointerEvents="none" style={[styles.room, breathe]} {...DRAWING}>
      <LinearGradient colors={["transparent", tint(color.screen, 0.11), tint(color.screen, 0.05), "transparent"]}
        locations={[0, 0.35, 0.7, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** One antenna rod from the base (100, 54) of a 200 × 58 box to its tip, with a ball on the end. */
function Rod({ tipX, tipY }: { tipX: number; tipY: number }) {
  const dx = tipX - 100;
  const dy = tipY - 54;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <>
      <View style={[styles.rod, { width: length, left: 100 + dx / 2 - length / 2, top: 54 + dy / 2 - 1.5, transform: [{ rotate: `${angle}deg` }] }]} />
      <View style={[styles.ball, { left: tipX - 5, top: tipY - 5 }]} />
    </>
  );
}

/** The set's rabbit ears: slate on the studio navy, the website's drawing. */
export function Antennae() {
  return (
    <View style={styles.antennae} pointerEvents="none" {...DRAWING}>
      <Rod tipX={44} tipY={8} />
      <Rod tipX={150} tipY={14} />
      <View style={styles.dome} />
    </View>
  );
}

/** The TV's body: an object, lit from above, with a bevel and one soft shadow. */
export function Cabinet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.cabinet}>
      <LinearGradient colors={[CAB_TOP, color.slate, CAB_BOT]} style={[StyleSheet.absoluteFill, styles.round]} pointerEvents="none" />
      <View style={styles.bevel} pointerEvents="none" />
      {children}
    </View>
  );
}

/** The bezel and the lit screen in it: glowing from its centre, with scanlines, a rolling line and a glare. */
export function LitScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [height, setHeight] = useState(0);
  const roll = useIdle(7000);
  const rolling = useAnimatedStyle(() => ({ transform: [{ translateY: -48 + roll.get() * (height + 48) }] }));
  return (
    <View style={[styles.bezel, style]}>
      <View style={styles.screen} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none" {...DRAWING}>
          <LinearGradient colors={[color.fieldDeep, GLOW, color.fieldDeep]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          {/* Darker at the sides too, so the light reads as coming from the middle. */}
          <LinearGradient colors={["rgba(11, 17, 34, 0.7)", "transparent", "rgba(11, 17, 34, 0.7)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill} />
          {Array.from({ length: Math.ceil(height / 4) }, (_, i) => <View key={i} style={[styles.scanline, { top: i * 4 + 2 }]} />)}
          <Animated.View style={[styles.roll, rolling]}>
            <LinearGradient colors={["transparent", tint(color.screen, 0.07), "transparent"]} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <LinearGradient colors={["rgba(255, 255, 255, 0.08)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.45 }} style={StyleSheet.absoluteFill} />
        </View>
        {children}
      </View>
    </View>
  );
}

/** The on-air light on the screen: slate "Standby" at rest, tally pink only while a sign-in is under way. */
export function Tally({ live }: { live: boolean }) {
  return (
    <View style={styles.tally}>
      <View style={[styles.tallyDot, live && styles.tallyDotLive]} />
      <Text variant="eyebrow" accessibilityLiveRegion="polite" style={[styles.tallyText, live && styles.tallyTextLive]}>
        {live ? "Tuning in" : "Standby"}
      </Text>
    </View>
  );
}

/** A domed knob with grip ridges and a pointer; the channel knob turns when the channel changes. */
function Knob({ turned }: { turned?: boolean }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(turned ? 1 : 0);
  useEffect(() => {
    const to = turned ? 1 : 0;
    turn.set(reduced ? to : withTiming(to, { duration: 240, easing: EASE_OUT }));
  }, [turned, reduced, turn]);
  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 90 - 30}deg` }] }));
  return (
    <View style={styles.knob}>
      <LinearGradient colors={["#a4afcf", color.slate, "#3c4664"]} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, styles.knobRound]} />
      <Animated.View style={[StyleSheet.absoluteFill, turning]}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * 30}deg` }] }]}>
            <View style={styles.ridge} />
          </View>
        ))}
        <View style={styles.pointer} />
      </Animated.View>
    </View>
  );
}

/** The side of the set: channel and volume knobs, the power light and the speaker grille. */
export function SidePanel({ channel }: { channel: 1 | 2 }) {
  return (
    <View style={styles.side} pointerEvents="none" {...DRAWING}>
      <Knob turned={channel === 2} />
      <Knob />
      <View style={styles.power} />
      <View style={styles.grille}>
        {Array.from({ length: 15 }, (_, i) => <View key={i} style={styles.hole} />)}
      </View>
    </View>
  );
}

/** Two feet, and the set's shadow on the floor. */
export function Feet() {
  return (
    <View style={styles.feet} pointerEvents="none" {...DRAWING}>
      <View style={styles.floor} />
      <View style={styles.foot} />
      <View style={styles.foot} />
    </View>
  );
}

/** The Plex key's small amber play mark (DESIGN.md: Plex in secondary style carries it), drawn from Views. */
export function PlayIcon() {
  return (
    <View style={styles.play} {...DRAWING}>
      <View style={styles.triangle} />
    </View>
  );
}

/** The mascot's gentle bob, 3.5s a cycle; still under Reduce Motion. */
export function useBob() {
  const t = useIdle(3500, true);
  return useAnimatedStyle(() => ({ transform: [{ translateY: -3 * t.get() }] }));
}

const styles = StyleSheet.create({
  room: { position: "absolute", left: -space.l, right: -space.l, top: 0, bottom: 0 },
  antennae: { width: 200, height: 58, alignSelf: "center", marginBottom: -2 },
  rod: { position: "absolute", height: 3, borderRadius: 1.5, backgroundColor: color.slate },
  ball: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: color.slate },
  dome: { position: "absolute", left: 78, top: 44, width: 44, height: 14, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: CAB_BOT },
  cabinet: {
    padding: space.m, gap: space.m, borderRadius: radius.l, backgroundColor: color.slate,
    // An object: one soft shadow under it (DESIGN.md, Elevation & Depth).
    elevation: 14, shadowColor: "#030612", shadowOpacity: 0.65, shadowRadius: 24, shadowOffset: { width: 0, height: 18 },
  },
  round: { borderRadius: radius.l },
  bevel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.l, borderWidth: 1,
    borderTopColor: LIGHT_EDGE, borderLeftColor: LIGHT_EDGE, borderBottomColor: DARK_EDGE, borderRightColor: DARK_EDGE,
  },
  bezel: {
    padding: space.s, borderRadius: radius.m, backgroundColor: "#1a2240",
    borderWidth: 1, borderTopColor: DARK_EDGE, borderLeftColor: DARK_EDGE, borderBottomColor: LIGHT_EDGE, borderRightColor: LIGHT_EDGE,
  },
  screen: {
    padding: space.m, gap: space.m, borderRadius: radius.s + 2, overflow: "hidden", backgroundColor: color.fieldDeep,
    borderWidth: 1, borderColor: tint(color.screen, 0.14),
  },
  scanline: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(3, 6, 18, 0.22)" },
  roll: { position: "absolute", left: 0, right: 0, top: 0, height: 48 },
  tally: { flexDirection: "row", alignItems: "center", gap: 6 },
  tallyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.slate },
  tallyDotLive: { backgroundColor: color.tally },
  tallyText: { color: color.slateInk },
  tallyTextLive: { color: color.tally },
  side: { width: 40, alignItems: "center", gap: space.m, paddingVertical: space.s },
  knob: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: DARK_EDGE, overflow: "hidden" },
  knobRound: { borderRadius: 17 },
  ridge: { position: "absolute", top: 1, left: 15, width: 2, height: 4, borderRadius: 1, backgroundColor: "rgba(3, 6, 18, 0.35)" },
  pointer: { position: "absolute", top: 5, left: 15, width: 2, height: 10, borderRadius: 1, backgroundColor: color.ink },
  power: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.screen, opacity: 0.85 },
  grille: { width: 32, flexDirection: "row", flexWrap: "wrap", gap: 5, justifyContent: "center" },
  hole: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.fieldDeep, borderBottomWidth: 1, borderColor: "rgba(174, 184, 216, 0.3)" },
  feet: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 40, height: 18 },
  floor: { position: "absolute", left: 16, right: 16, top: 6, height: 14, borderRadius: 999, backgroundColor: "rgba(3, 6, 18, 0.55)" },
  foot: { width: 28, height: 10, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: CAB_BOT },
  play: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.note, alignItems: "center", justifyContent: "center" },
  triangle: {
    width: 0, height: 0, marginLeft: 2, borderLeftWidth: 7, borderTopWidth: 4.5, borderBottomWidth: 4.5,
    borderLeftColor: color.note, borderTopColor: "transparent", borderBottomColor: "transparent",
  },
});
