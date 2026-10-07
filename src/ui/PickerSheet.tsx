// A small dropdown, Plexbie's way: a pill that says what's chosen ("Every language ▾"),
// which opens a sheet of options from the bottom. One choice (Type, Genre) closes on a
// tap; several (Language) are ticked, then Done. Back or a tap outside closes it.
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./Button";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";
import { color, EASE_OUT, font, radius, space, TOUCH } from "./theme";
import { GlassFill, glass } from "./Glass";
import { useLargeText } from "./useColumns";

export interface PickerOption { value: string; label: string }

/** Room for Android's navigation bar: inside a full-screen pop-up the safe-area inset can
 *  come back as 0, and the last option sat under the bar. iOS reports its home indicator. */
const NAV_BAR = Platform.OS === "android" ? 56 : 0;

/** iOS 26 sheets follow the screen's own corners. */
const SHEET_RADIUS = 32;

const rise = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
}).duration(220);

export function PickerPill({ title, label, options, value, multiple, onChange }: {
  /** What it picks ("Language"), the sheet's title and the pill's spoken name. */
  title: string;
  /** What the pill says now ("Every language", "English, Japanese"). */
  label: string;
  options: PickerOption[];
  /** The chosen value (one), or values (multiple). */
  value: string | string[];
  multiple?: boolean;
  onChange: (next: string | string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const chosen = (v: string) => (multiple ? draft.includes(v) : value === v);
  const show = () => { setDraft(Array.isArray(value) ? value : [value]); setOpen(true); };
  const pick = (v: string) => {
    if (!multiple) { setOpen(false); if (v !== value) onChange(v); return; }
    // "" is "all of them" (Every language): it clears the rest, and the rest clear it.
    setDraft((d) => (v === "" ? [] : d.includes(v) ? d.filter((x) => x !== v) : [...d.filter((x) => x !== ""), v]));
  };
  const done = () => { setOpen(false); onChange(draft); };

  return (
    <>
      <PressableScale haptic="none" onPress={show} accessibilityRole="button" accessibilityLabel={`${title}: ${label}`}
        accessibilityHint="Opens the choices" style={[styles.pill, glass.surface]}>
        <GlassFill radius={20} interactive />
        <Text variant="label" style={styles.pillText} numberOfLines={large ? undefined : 1}>{label}</Text>
        <Text style={styles.caret} accessible={false}>▾</Text>
      </PressableScale>
      <Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.layer}>
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
            <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          <Animated.View entering={rise} exiting={FadeOut.duration(120)} style={[styles.sheet, glass.surface, styles.sheetIOS, { paddingBottom: Math.max(insets.bottom, NAV_BAR) + space.l }]}
            accessibilityViewIsModal>
            <GlassFill radius={SHEET_RADIUS} strong />
            <Text variant="title" accessibilityRole="header">{title}</Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {options.map((o) => {
                const on = multiple && o.value === "" ? !draft.length : chosen(o.value);
                return (
                  <PressableScale key={o.value} haptic="none" onPress={() => pick(o.value)} style={[styles.option, on && styles.optionOn]}
                    accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: on }}>
                    <View style={[multiple ? styles.box : styles.dot, on && styles.markOn]}>
                      {on ? <Text style={styles.tick} accessible={false}>{multiple ? "✓" : "●"}</Text> : null}
                    </View>
                    <Text variant="label" style={styles.optionText}>{o.label}</Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
            {multiple ? <Button label="Done" onPress={done} /> : null}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // As wide as its row allows, so "Waiting for a decision · 3" isn't cut off; at large text
  // sizes the words wrap, and the padding keeps a second line off the border.
  pill: {
    flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 40, paddingHorizontal: space.m, paddingVertical: space.xs, maxWidth: "100%",
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.panel,
  },
  pillText: { color: color.ink, fontSize: 15, flexShrink: 1 },
  caret: { color: color.slateInk, fontSize: 12 },
  layer: { flex: 1, justifyContent: "flex-end" },
  scrim: { flex: 1, backgroundColor: Platform.OS === "ios" ? "rgba(6, 9, 20, 0.5)" : "rgba(6, 9, 20, 0.72)" },
  sheet: {
    gap: space.m, paddingTop: space.xl, paddingHorizontal: space.xl, maxHeight: "75%",
    borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, backgroundColor: color.panel,
    borderWidth: 1, borderColor: color.rule,
  },
  // Shrinks to fit the sheet (at most 75% of the screen) and scrolls: without flexShrink it
  // grew to all its options, ran past the sheet, and couldn't scroll.
  // iOS 26's sheets float: inset from the edges, rounded all round like the phone itself.
  sheetIOS: Platform.OS === "ios" ? { margin: space.s, borderRadius: SHEET_RADIUS } : {},
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: space.xs },
  option: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: TOUCH, paddingHorizontal: space.m, borderRadius: radius.m },
  optionOn: { backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.08)" : color.panelRaised },
  optionText: { color: color.ink, fontFamily: font.medium, fontSize: 16 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  markOn: { borderColor: color.screen, backgroundColor: color.screen },
  tick: { color: color.onScreen, fontSize: 13, lineHeight: 16, fontFamily: font.bold },
});
