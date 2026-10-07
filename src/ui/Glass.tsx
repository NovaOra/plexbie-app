// iOS's materials, Plexbie's way. On iOS 26 cards, sheets and floating buttons are Liquid
// Glass (the system's own, through expo-glass-effect): the studio light behind them shows
// through, bent and frosted. Older iOS gets the frosted blur it had. Android keeps its
// solid panels: Material doesn't do glass, and a fake one would read as a website.
//
// A card keeps its own layout and shape; <GlassFill> goes first inside it as the material,
// and `glass.surface` swaps its panel colour for a clear one with a bright hairline edge,
// light catching the rim.
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IOS = Platform.OS === "ios";
/** iOS 26 or later: the real Liquid Glass. */
const LIQUID = IOS && isLiquidGlassAvailable();

/** The panel colour the glass carries, so text on it keeps its contrast over anything. */
const TINT = "rgba(24, 33, 58, 0.42)";
const TINT_STRONG = "rgba(16, 23, 43, 0.62)";
const EDGE = "rgba(255, 255, 255, 0.14)";

export const glass = StyleSheet.create({
  /** A card on glass: no panel colour (the material is behind it), a light rim. iOS only. */
  surface: IOS ? { backgroundColor: "transparent", borderColor: EDGE, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" } : {},
});

/** The material behind a card, first inside it. Matches the card's corner radius.
 *  `strong` for something laid over the page (a sheet, a dialog) that must hold its own. */
export function GlassFill({ radius, strong, interactive }: { radius: number; strong?: boolean; interactive?: boolean }) {
  if (!IOS) return null;
  const shape = [StyleSheet.absoluteFill, { borderRadius: radius }];
  if (LIQUID) {
    return <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive}
      tintColor={strong ? TINT_STRONG : TINT} style={shape} />;
  }
  return (
    <View pointerEvents="none" style={[shape, { overflow: "hidden" }]}>
      <BlurView tint="systemMaterialDark" intensity={strong ? 90 : 60} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/** On iOS the tab bar floats over the page (Android's sits below it): a tab's list ends
 *  this much higher, so its last row can scroll clear of the glass. */
export const TAB_BAR_CLEARANCE = IOS ? 56 : 0;

const AMBIENT = require("../../assets/brand/ambient.png");

/** The studio behind the glass on iOS: two soft pools of light, the screen's pink and the
 *  set's blue, on the dark field. Still, quiet, and only there so the glass has something
 *  to bend; flat navy behind glass just reads as grey. Android keeps the flat field. */
export function Ambient() {
  if (!IOS) return null;
  return <Image source={AMBIENT} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

/** How far below the clock the fade reaches. */
const TOP_FADE = 28;

/** The top edge, on both platforms: the page runs all the way up behind the status bar
 *  (and the Dynamic Island) and fades into the page colour there, like iOS 26's scroll
 *  edge effect, so scrolled content never fights the clock and there's no hard band. */
export function FrostedTop(props: ViewProps) {
  const { top } = useSafeAreaInsets();
  return (
    <LinearGradient pointerEvents="none" {...props}
      colors={["rgba(16, 23, 43, 0.94)", "rgba(16, 23, 43, 0.72)", "rgba(16, 23, 43, 0)"]}
      locations={[0, top / (top + TOP_FADE), 1]}
      style={[styles.top, { height: top + TOP_FADE }, props.style]} />
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0 },
});
