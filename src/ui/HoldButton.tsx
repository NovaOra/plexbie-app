// An action you have to mean, as the website's: press and hold until the fill reaches the
// end (about a second), or press twice. The first quick press arms it ("Tap again to
// decline", said out loud) and a second within a few seconds confirms; otherwise it
// disarms by itself. Letting go of a hold early cancels, with a word about it (`bail`).
// A screen reader, a switch, voice or a keyboard press it the same way: twice.
// The fill is a transform on the UI thread; the words change a handful of times a hold.
// It's as wide as its resting words ("Hold to decline") need, and keeps that width whatever
// it says next: longer words shrink a little to fit on their line (to 85%), and "Tap again
// to decline" that still won't fit says "Again to decline". Words are never cut.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";
import * as haptic from "./haptics";
import { Text } from "./Text";
import { color, depth, radius, TOUCH, type } from "./theme";
import { useLargeText } from "./useColumns";

/** What an armed hold says: the verb kept ("Tap again to decline"), on one line. */
export const armedWords = (label: string) => `Tap again to ${label.toLowerCase()}`;
/** The same, where the long words won't fit even shrunk: "Again to decline". */
export const armedShort = (label: string) => `Again to ${label.toLowerCase()}`;
/** How far words other than the resting ones may shrink before the short form is used. */
export const MIN_FONT_SCALE = 0.85;
/** The words' box: 18 each side (see labelBox), and a hair to spare so a line that only just fits isn't cut. */
const INSET = 18 * 2 + 2;

/** A press shorter than this is a tap: it arms, or confirms once armed. */
const TAP_MS = 300;
/** How long it stays armed waiting for the second press. */
const ARMED_MS = 4000;

export function HoldButton({ label, onConfirm, ms = 1000, stages = [], bail, disabled, busy = false, blocked = false, kind = "secondary", confirmText, accessibilityLabel, style }: {
  label: string;
  onConfirm: () => void;
  ms?: number;
  /** What it says through the hold, evenly spaced. */
  stages?: string[];
  /** Shown for a moment after letting go early. */
  bail?: string;
  disabled?: boolean;
  /** Its own action is running: it looks pressed and takes no press. */
  busy?: boolean;
  /** Another action on the same thing is running: flat and slate, no press. */
  blocked?: boolean;
  /** A raised key (the default), the screen's one pink key, or a hollow pill. */
  kind?: "secondary" | "primary" | "quiet";
  /** What it does, said with the hint for a screen reader. */
  confirmText?: string;
  /** What it acts on, in full ("Decline Sintel for Sam"); its name is "Hold to decline Sintel for Sam". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = useSharedValue(0);
  const width = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const [stage, setStage] = useState(0);
  const [bailed, setBailed] = useState(false);
  // Its width at rest, and how wide each of its other words are on one line, as the phone lays them out.
  const [restWidth, setRestWidth] = useState(0);
  const [natural, setNatural] = useState<Record<string, number>>({});
  const large = useLargeText();
  const reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const done = useRef(false);
  // Refs, not state: a release, a screen reader or `disabled` can change between a press
  // and the next render, and the timers have to see it.
  const pressed = useRef(false);
  const pressedAt = useRef(0);
  const held = useRef(false);
  const touched = useRef(false);
  const quick = useRef(false);
  const isArmed = useRef(false);
  const reader = useRef(false);
  const off = !!disabled || busy || blocked;
  const what = accessibilityLabel ?? label;
  const lower = (w: string) => `${w.charAt(0).toLowerCase()}${w.slice(1)}`;
  const latest = useRef({ onConfirm, off });
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { clear(); clearTimeout(armTimer.current); }, []);
  useEffect(() => { latest.current = { onConfirm, off }; });

  // Known before anyone presses, so a press never waits on the answer.
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (live) reader.current = on; });
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (on: boolean) => { reader.current = on; });
    return () => { live = false; sub.remove(); };
  }, []);

  const arm = (on: boolean) => {
    clearTimeout(armTimer.current);
    isArmed.current = on;
    setArmed(on);
    if (on) {
      armTimer.current = setTimeout(() => arm(false), ARMED_MS);
      AccessibilityInfo.announceForAccessibility(`Tap again to ${lower(what)}`);
    }
  };
  const confirm = () => {
    if (latest.current.off) return;
    arm(false);
    latest.current.onConfirm();
  };
  // A quick press: the first arms it, the second confirms.
  const tapped = () => {
    if (latest.current.off) return;
    if (isArmed.current) confirm();
    else { haptic.tap(); arm(true); }
  };

  const empty = () => {
    clear();
    held.current = false;
    setHolding(false);
    cancelAnimation(fill);
    fill.set(withTiming(0, { duration: 200 }));
  };
  const start = () => {
    if (latest.current.off) return;
    clear();
    done.current = false;
    held.current = true;
    setBailed(false);
    setHolding(true);
    setStage(0);
    // Progress, not decoration: with Reduce Motion it still fills over the whole hold.
    fill.set(withTiming(1, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    stages.forEach((_, i) => {
      if (i) timers.current.push(setTimeout(() => { setStage(i); haptic.select(); }, (ms / stages.length) * i));
    });
    timers.current.push(setTimeout(() => {
      if (!pressed.current || latest.current.off) return empty();
      done.current = true;
      held.current = false;
      setHolding(false);
      haptic.tap();
      confirm();
    }, ms));
  };
  const stop = (tap: boolean) => {
    if (done.current || !held.current) return;
    empty();
    if (bail && !tap) {
      setBailed(true);
      timers.current.push(setTimeout(() => setBailed(false), 2200));
    }
  };
  // Turned off mid-hold (something else started), it lets go without a word, and disarms.
  useEffect(() => {
    if (!off) return;
    if (held.current) empty();
    if (isArmed.current) arm(false);
  });
  // Once it's gone through, the bar empties for next time.
  useEffect(() => { if (!holding && done.current) fill.set(0); }, [holding, fill]);

  // The fill slides in from the left with a dark copy of the words riding on it, held in
  // place, so the words read on both halves.
  const bar = useAnimatedStyle(() => ({
    opacity: width.get() ? 1 : 0,
    transform: [{ translateX: (fill.get() - 1) * width.get() }],
  }));
  const still = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - fill.get()) * width.get() }] }));
  const resting = `Hold to ${label.toLowerCase()}`;
  const said = holding && stages.length ? stages[stage] : armed ? armedWords(label) : bailed && bail ? bail : resting;
  const others = [...new Set([armedWords(label), armedShort(label), ...(bail ? [bail] : []), ...stages])].filter((w) => w !== resting);
  // Fitted into the width it has at rest (with large text the words wrap instead).
  const room = restWidth - INSET - (kind === "quiet" ? 2 : 0);
  const fits = (w: string) => { const n = natural[w]; return large || !restWidth || n === undefined || n <= room ? 1 : room / n; };
  const words = armed && !holding && fits(said) < MIN_FONT_SCALE ? armedShort(label) : said;
  const scale = words === resting ? 1 : Math.min(1, fits(words));
  const sized = scale < 1 ? { fontSize: Math.floor(16 * scale * 2) / 2 } : null;

  const quiet = kind === "quiet";
  const pink = kind === "primary";
  const flat = (!!disabled || blocked) && !busy;
  const sunk = !flat && (holding || busy);
  const ink = flat ? (quiet ? color.faint : color.slateInk) : pink ? color.onScreen : color.ink;
  const face = flat ? (quiet ? styles.quietOff : styles.keyOff) : quiet ? styles.quiet : pink ? styles.primary : styles.secondary;
  // Armed, a tally lip runs along its foot; otherwise the key's own lip, thinner while held.
  const lip = flat ? 0 : armed ? depth.lip : quiet ? (sunk ? depth.lipDown : depth.quietLip) : sunk ? depth.lipDown : depth.lip;
  const lipColor = armed ? color.tally : quiet ? depth.quietLipColor : pink ? color.screenDeep : depth.keyLip;

  return (
    <Pressable
      onPressIn={() => {
        pressed.current = true;
        touched.current = true;
        pressedAt.current = Date.now();
        if (!reader.current) start();
      }}
      onPressOut={() => {
        pressed.current = false;
        const tap = Date.now() - pressedAt.current < TAP_MS;
        quick.current = tap;
        stop(tap);
        // A press that slides off never gets its onPress: forget the touch after this turn.
        setTimeout(() => { touched.current = false; quick.current = false; }, 0);
      }}
      // A finger's quick tap arms it, or confirms once armed; a finger's hold confirms by
      // itself. A click with no touch behind it (a keyboard, a switch), or any press with a
      // screen reader on, works like a tap.
      onPress={() => {
        const touch = touched.current;
        // A tap quicker than the press React Native lets show (130ms) reaches here before
        // onPressOut, so it's timed here too, or the quickest taps would never arm it.
        const tap = quick.current || (pressed.current && Date.now() - pressedAt.current < TAP_MS);
        touched.current = false;
        quick.current = false;
        if (!touch || reader.current || tap) tapped();
      }}
      // A screen reader's double tap, Switch Access and Voice Access activate it through the
      // "activate" action on Android; VoiceOver, Switch Control, Voice Control and Full
      // Keyboard Access through onAccessibilityTap on iOS, where a declared action would
      // show up again as a custom action.
      accessibilityActions={Platform.OS === "android" ? [{ name: "activate", label }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === "activate") tapped(); }}
      onAccessibilityTap={tapped}
      disabled={off}
      accessibilityRole="button"
      // The name starts with the words on it, so "tap Hold to import it" works for voice control.
      accessibilityLabel={armed ? `Tap again to ${lower(what)}` : `Hold to ${lower(what)}`}
      accessibilityHint={`${confirmText ? `${confirmText} ` : ""}Press and hold, or press twice, to confirm.`}
      accessibilityState={{ disabled: off, busy }}
      // Its width is taken at rest and kept while it says anything else, so a key sized by its words never grows.
      onLayout={(e) => { if (words === resting) setRestWidth(e.nativeEvent.layout.width); }}
      style={[styles.button, quiet ? styles.pill : styles.key, face, sunk && !reduced && styles.down, style, words !== resting && restWidth ? { width: restWidth } : null]}
    >
      <View style={styles.labelBox} pointerEvents="none">
        <Text style={[quiet ? type.quiet : type.button, styles.label, { color: ink }, sized]} numberOfLines={large ? undefined : 1}>{words}</Text>
      </View>
      <Animated.View style={[styles.fill, bar]} pointerEvents="none" onLayout={(e) => width.set(e.nativeEvent.layout.width)}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fillWords, still]}>
          <View style={styles.labelBox}>
            <Text style={[quiet ? type.quiet : type.button, styles.label, styles.labelOn, sized]} numberOfLines={large ? undefined : 1}>{words}</Text>
          </View>
        </Animated.View>
      </Animated.View>
      {lip ? <View testID="key-lip" pointerEvents="none" style={[styles.lip, { height: lip, backgroundColor: lipColor }]} /> : null}
      {/* Its other words laid out unconstrained, off screen, to know their real widths. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {others.map((w) => (
          <Text key={w} style={quiet ? type.quiet : type.button} testID="hold-measure"
            onLayout={(e) => { const n = Math.ceil(e.nativeEvent.layout.width); setNatural((m) => (m[w] === n ? m : { ...m, [w]: n })); }}>{w}</Text>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { overflow: "hidden", justifyContent: "center" },
  key: { minHeight: TOUCH, borderRadius: radius.s },
  pill: { minHeight: TOUCH, borderRadius: radius.pill, borderWidth: 1 },
  primary: { backgroundColor: color.screen },
  secondary: { backgroundColor: color.panelRaised },
  keyOff: { backgroundColor: color.panelRaised },
  quiet: { backgroundColor: "transparent", borderColor: color.slate },
  quietOff: { backgroundColor: "transparent", borderColor: color.rule },
  // Held (or under way), the face goes down 2px, as a key does.
  down: { transform: [{ translateY: depth.press }] },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", backgroundColor: color.tally },
  fillWords: { flex: 1, justifyContent: "center" },
  labelBox: { paddingHorizontal: 18, paddingVertical: 8, alignItems: "center" },
  label: { textAlign: "center" },
  // Dark on the pink, as the website's --on-tally.
  labelOn: { color: color.onTally },
  lip: { position: "absolute", left: 0, right: 0, bottom: 0 },
  measure: { position: "absolute", left: -10000, top: 0, width: 4000, alignItems: "flex-start", opacity: 0 },
});
