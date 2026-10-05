// The top of a pushed screen: a back button (the system back gesture works too).
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, space } from "./theme";
import { GlassFill, glass } from "./Glass";

export function BackHeader({ overlay }: { overlay?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, overlay && styles.overlay, { paddingTop: insets.top + space.s }]} pointerEvents="box-none">
      <PressableScale
        haptic="none"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/requests"))}
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
    alignSelf: "flex-start", justifyContent: "center", minHeight: 44, paddingHorizontal: space.l, borderRadius: 22,
    backgroundColor: "rgba(11, 17, 34, 0.72)",
  },
  backText: { color: color.ink },
});
