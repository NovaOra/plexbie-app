// Manage's sections, the way a menu button's drawer works on a phone: the list slides in
// from the right, under the menu button, and pushes the whole page left by its own width,
// the two moving together, rather than covering it. The strip of page still showing is
// dimmed; a tap there, Back on Android, a swipe right on the list or the screen reader's
// escape gesture slides it all back. The tab bar stays where it is.
// With Remove animations on, nothing slides: the drawer is just there, then gone.
import { useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo, BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type Text as RNText,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassFill, glass, TAB_BAR_CLEARANCE } from "../../ui/Glass";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { color, EASE_OUT, font, radius, space, TOUCH } from "../../ui/theme";

/** `hot`: something is waiting in it, so it stands out in the screen's pink. */
export interface DrawerSection { value: string; label: string; hot?: boolean }

const IOS = Platform.OS === "ios";
/** How long the page and the drawer take to slide, either way. */
const SLIDE = 240;
/** iOS 26's floating panels follow the screen's own corners. */
const PANEL_RADIUS = 32;

export function SectionsDrawer({ open, onClose, sections, value, onChoose, children }: {
  open: boolean;
  onClose: () => void;
  sections: DrawerSection[];
  /** The section shown, marked in the list. */
  value: string;
  onChoose: (value: string) => void;
  /** The page it pushes aside. */
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // At most 300 wide, and never more than 80% of the screen, so some of the page still shows.
  const width = Math.min(300, Math.round(useWindowDimensions().width * 0.8));
  /** 0 closed, 1 open: how far across both have slid. */
  const shown = useSharedValue(0);
  const heading = useRef<RNText>(null);
  const opened = useRef(false);

  useEffect(() => {
    // Nothing to slide back from until it has opened once.
    if (!open && !opened.current) return;
    opened.current = true;
    shown.set(reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: SLIDE, easing: EASE_OUT }));
    if (!open) return;
    // A message being written stays as it is, but the keyboard goes with the page.
    Keyboard.dismiss();
    // Screen-reader focus to the drawer, once it has arrived.
    const t = setTimeout(() => { if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current as never, "focus"); }, reduced ? 50 : SLIDE);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduced]);

  // Android Back closes it, rather than leaving Manage.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);

  // A swipe right on the drawer takes both with the finger; let go past a third (or flicked), it closes.
  const swipe = Gesture.Pan().enabled(open).activeOffsetX(16).failOffsetY([-16, 16])
    .onUpdate((e) => { shown.set(Math.min(1, Math.max(0, 1 - e.translationX / width))); })
    .onEnd((e) => {
      if (e.translationX > width / 3 || e.velocityX > 800) scheduleOnRN(onClose);
      else shown.set(withTiming(1, { duration: SLIDE, easing: EASE_OUT }));
    });

  const push = useAnimatedStyle(() => ({ transform: [{ translateX: -shown.get() * width }] }));
  const dim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - shown.get()) * width }] }));

  return (
    <View style={styles.frame}>
      <Animated.View style={[styles.fill, push]}>
        <View style={styles.fill} accessibilityElementsHidden={open} importantForAccessibility={open ? "no-hide-descendants" : "auto"}>
          {children}
        </View>
        <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, dim]}>
          <Pressable testID="sections-scrim" style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the sections"
            accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} />
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View testID="sections-drawer" pointerEvents={open ? "auto" : "none"} style={[styles.drawer, { width }, slide]}
          accessibilityViewIsModal={open} onAccessibilityEscape={onClose}
          accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"}>
          <View style={[styles.panel, IOS
            ? [glass.surface, styles.panelIOS, { marginTop: insets.top + space.s, marginBottom: insets.bottom + TAB_BAR_CLEARANCE + space.s }]
            : [styles.panelAndroid, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]]}>
            <GlassFill radius={IOS ? PANEL_RADIUS : 0} strong />
            <Text ref={heading} variant="title" accessibilityRole="header" style={styles.title}>Sections</Text>
            <ScrollView contentContainerStyle={styles.list}>
              {sections.map((s) => {
                const on = s.value === value;
                return (
                  <PressableScale key={s.value} onPress={() => onChoose(s.value)} style={[styles.option, on && styles.optionOn]}
                    accessibilityRole="radio" accessibilityState={{ checked: on }}>
                    <View style={[styles.dot, on && styles.markOn]}>
                      {on ? <Text style={styles.tick} accessible={false}>●</Text> : null}
                    </View>
                    <Text variant="label" style={[styles.optionText, s.hot && styles.optionHot]}>{s.label}</Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden" },
  fill: { flex: 1 },
  scrim: { flex: 1, backgroundColor: IOS ? "rgba(6, 9, 20, 0.5)" : "rgba(6, 9, 20, 0.72)" },
  // Just past the right edge until it slides in.
  drawer: { position: "absolute", top: 0, bottom: 0, right: 0 },
  panel: { flex: 1, gap: space.m, paddingHorizontal: space.l },
  // Android: a full-height panel, rounded on its open edge, the sheet's colours.
  panelAndroid: {
    backgroundColor: color.panel, borderTopLeftRadius: radius.l, borderBottomLeftRadius: radius.l, borderLeftWidth: 1, borderColor: color.rule,
  },
  // iOS 26: a floating glass panel, inset from the edges and rounded all round, ending
  // above the floating tab bar rather than behind it.
  panelIOS: { marginRight: space.s, paddingTop: space.l, borderRadius: PANEL_RADIUS },
  title: { paddingHorizontal: space.m },
  list: { gap: space.xs, paddingBottom: space.s },
  option: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: TOUCH, paddingHorizontal: space.m, borderRadius: radius.m },
  optionOn: { backgroundColor: IOS ? "rgba(255, 255, 255, 0.08)" : color.panelRaised },
  optionText: { color: color.ink, fontFamily: font.medium, fontSize: 16 },
  optionHot: { color: color.screen },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  markOn: { borderColor: color.screen, backgroundColor: color.screen },
  tick: { color: color.onScreen, fontSize: 13, lineHeight: 16, fontFamily: font.bold },
});
