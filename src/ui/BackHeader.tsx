// The top of a pushed screen: a back button (the system back gesture works too).
import { router, type Href } from "expo-router";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, space } from "./theme";
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

/** `fallback`: where Back goes when nothing is under this screen (it was opened from a link). */
export function BackHeader({ overlay, fallback = "/requests" }: { overlay?: boolean; fallback?: Href }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, overlay && styles.overlay, { paddingTop: insets.top + space.s }]} pointerEvents="box-none">
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
  back: {
    alignSelf: "flex-start", justifyContent: "center", minHeight: BACK_HEIGHT, paddingHorizontal: space.l, borderRadius: 22,
    ...(Platform.OS === "ios" ? { backgroundColor: "rgba(11, 17, 34, 0.72)" } : { backgroundColor: color.fieldDeep, borderWidth: 1, borderColor: color.slate }),
  },
  backText: { color: color.ink },
});
