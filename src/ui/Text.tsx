import type { Ref } from "react";
import { Text as RNText, type TextProps, StyleSheet } from "react-native";
import { color, font, type } from "./theme";

type Variant = "display" | "heading" | "title" | "body" | "meta" | "label" | "eyebrow";

/**
 * Archivo in the website's ranks. Scales with the system text size (never fixed heights),
 * up to 2x (big headings 1.6x; a caller can set its own cap). Shrinks to its row rather
 * than pushing past it, so large text wraps instead of running off the screen.
 */
export function Text({ variant = "body", style, ref, ...rest }: TextProps & { variant?: Variant; ref?: Ref<RNText> }) {
  return <RNText ref={ref} maxFontSizeMultiplier={variant === "display" || variant === "heading" ? 1.6 : 2} {...rest} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { color: color.ink, fontFamily: font.regular, flexShrink: 1 },
  display: { ...type.display, textTransform: "uppercase" },
  heading: type.h2,
  title: type.h3,
  body: { ...type.body, color: color.slateInk },
  meta: { ...type.small, color: color.slateInk },
  label: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
  eyebrow: { ...type.caps, textTransform: "uppercase", color: color.slateInk },
});
