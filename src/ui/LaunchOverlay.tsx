// The first second of the app: Android's launch screen (the rounded logo, app.json) hands
// over to this overlay, the same logo in the same place. Once the app is ready, the logo
// winds up, makes one turn with a little bounce, and opens onto the app as it fades. It
// never holds the app back: it only starts when the app is ready, takes under a second,
// and lets taps through. With Remove animations on, it just fades.
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { color, EASE_OUT } from "./theme";

const LOGO = require("../../assets/brand/splash-rounded.png");
/** The launch screen's logo width in dp: imageWidth for expo-splash-screen in app.json. */
const SIZE = 120;
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// Android's launch screen fades as this takes over, so the two never visibly swap.
SplashScreen.setOptions({ fade: true, duration: 120 });
/** The spin waits for that fade, so the two logos never show at once. */
const AFTER_HANDOVER = 140;

export function LaunchOverlay({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  const scale = useSharedValue(1);
  const shown = useSharedValue(1);

  // Never stuck on the launch screen: if the logo somehow doesn't load, it goes anyway.
  useEffect(() => { const t = setTimeout(() => void SplashScreen.hideAsync(), 1500); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!ready) return;
    const finish = () => setGone(true);
    if (reduced) {
      shown.set(withTiming(0, { duration: 240 }, (done) => { if (done) scheduleOnRN(finish); }));
      return;
    }
    // A small wind-up, one turn that overshoots a touch, then it opens up as it fades.
    scale.set(withDelay(AFTER_HANDOVER, withSequence(
      withTiming(0.88, { duration: 140, easing: EASE_OUT }),
      withSpring(1.06, { duration: 520, dampingRatio: 0.55 }),
      withTiming(1.3, { duration: 280, easing: EASE_OUT }),
    )));
    turn.set(withDelay(AFTER_HANDOVER + 100, withTiming(360, { duration: 620, easing: EASE_IN_OUT })));
    shown.set(withDelay(AFTER_HANDOVER + 700, withTiming(0, { duration: 280, easing: EASE_OUT }, (done) => { if (done) scheduleOnRN(finish); })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reduced]);

  const logo = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }, { scale: scale.get() }] }));
  const layer = useAnimatedStyle(() => ({ opacity: shown.get() }));
  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer, layer]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={logo}>
        {/* Android's launch screen goes once this logo is on screen, so there's no gap. */}
        <Image source={LOGO} style={styles.logo} fadeDuration={0} onLoadEnd={() => void SplashScreen.hideAsync()}
          onError={() => void SplashScreen.hideAsync()} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: color.field, alignItems: "center", justifyContent: "center", zIndex: 100 },
  logo: { width: SIZE, height: SIZE },
});
