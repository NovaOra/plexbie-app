import type { Ref } from "react";
import { Text as RNText, type TextProps, StyleSheet } from "react-native";
import { color, font } from "./theme";

type Variant = "display" | "title" | "body" | "meta" | "label" | "eyebrow";

/**
 * Archivo in the website's ranks. Scales with the system text size (never fixed heights),
 * up to 2x (big headings 1.6x; a caller can set its own cap). Shrinks to its row rather
 * than pushing past it, so large text wraps instead of running off the screen.
 */
export function Text({ variant = "body", style, ref, ...rest }: TextProps & { variant?: Variant; ref?: Ref<RNText> }) {
  return <RNText ref={ref} maxFontSizeMultiplier={variant === "display" ? 1.6 : 2} {...rest} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { color: color.ink, fontFamily: font.regular, flexShrink: 1 },
  display: { fontFamily: font.black, fontSize: 34, lineHeight: 36, letterSpacing: -0.5, textTransform: "uppercase" },
  title: { fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 23, color: color.slateInk },
  meta: { fontSize: 14, lineHeight: 20, color: color.slateInk },
  label: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
  eyebrow: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase", color: color.slateInk },
});
