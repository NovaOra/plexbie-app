// The top of a pushed screen: a back button (the system back gesture works too). Floating
// over a page that scrolls under it, it has a band of the page's colour behind it, solid
// to the middle of the pill and fading out below it, so what scrolls up fades away before
// it reaches the pill rather than showing round it and running into its words. A
// gradient, not a blur: on Android the pill itself stays solid.
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, space, tint } from "./theme";
import { GlassFill, glass } from "./Glass";

/** How far down a page under a floating Back starts its content, so nothing sits under the
 *  pill at rest: the pill's top gap, its height (it grows with the phone's text size, as its
 *  label does, capped at 2x) and a gap under it. */
export function useBackClearance() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return insets.top + space.s + Math.max(BACK_HEIGHT, Math.ceil(20 * Math.min(fontScale, 2)) + 24) + space.l;
}

const BACK_HEIGHT = 44;
/** The fade under a floating Back: about 72dp below the status bar (more with large text, as the pill grows). */
const FADE = 72;

/** `fallback`: where Back goes when nothing is under this screen (it was opened from a link). */
export function BackHeader({ overlay, fallback = "/requests" }: { overlay?: boolean; fallback?: Href }) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const pill = Math.max(BACK_HEIGHT, Math.ceil(20 * Math.min(fontScale, 2)) + 24);
  const band = insets.top + Math.max(FADE, space.s + pill + space.l + space.xs);
  // Solid down to the pill's middle, then fading to nothing at the band's foot.
  const solid = (insets.top + space.s + pill / 2) / band;
  return (
    <View style={[styles.bar, overlay && styles.overlay, { paddingTop: insets.top + space.s }]} pointerEvents="box-none">
      {overlay ? (
        <LinearGradient testID="back-fade" pointerEvents="none" colors={[color.field, color.field, tint(color.field, 0)]}
          locations={[0, solid, 1]} style={[styles.fade, { height: band }]} />
      ) : null}
      <PressableScale
        haptic="none"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
        accessibilityLabel="Back"
        style={[styles.back, glass.surface]}
      >
        <GlassFill radius={22} interactive />
        <Text variant="label" style={styles.backText}>‹ Back</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.l, paddingBottom: space.s },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 2 },
  fade: { position: "absolute", left: 0, right: 0, top: 0 },
  back: {
    alignSelf: "flex-start", justifyContent: "center", minHeight: BACK_HEIGHT, paddingHorizontal: space.l, borderRadius: 22,
    ...(Platform.OS === "ios" ? { backgroundColor: "rgba(11, 17, 34, 0.72)" } : { backgroundColor: color.fieldDeep, borderWidth: 1, borderColor: color.slate }),
  },
  backText: { color: color.ink },
});
