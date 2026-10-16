// Plexbie's "On Air" palette, the same tokens as the website (web/src/styles.css).
import { cubicBezier, Easing } from "react-native-reanimated";

export const color = {
  field: "#10172b",        // the page: a dark studio
  fieldDeep: "#0b1122",
  panel: "#18213a",
  panelRaised: "#212b4a",
  rule: "#2d385b",
  slate: "#6879a6",        // control borders (3:1 or better on field and panel)
  faint: "#7f8fbb",        // placeholders and "not yet" text (4.5:1 or better on field and panel)
  slateInk: "#aeb8d8",     // secondary text
  ink: "#f7f1f6",          // primary text
  screen: "#ffd1e4",       // the TV's pink screen: the accent
  screenDeep: "#f5b3cf",    // a pink key's lip, and its face while pressed
  screenHover: "#ffe0ed",
  onScreen: "#141b30",
  tally: "#ff5c93",        // the red "on air" tally light: live and urgent only
  onTally: "#1a0710",
  note: "#e5a00d",         // amber: what only admins see, and Plex
  noteHover: "#e9ae31",
  noteDeep: "#c3880b",
  onNote: "#1f1503",
} as const;

/** Depth (DESIGN.md, Elevation & Depth): things you press look like hardware. */
export const depth = {
  /** A key's lip under its face, 3px, and 1px while pressed (the face sinks 2px). */
  lip: 3, lipDown: 1, press: 2,
  keyLip: "rgba(3, 6, 18, 0.4)",
  /** A quiet pill's smaller lip. */
  quietLip: 2,
  quietLipColor: "rgba(104, 121, 166, 0.35)",
  /** The 1px light along a key's top edge. */
  highlight: "rgba(255, 255, 255, 0.12)",
} as const;

export const font = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_800ExtraBold",
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { s: 6, m: 12, l: 16, pill: 999 } as const;

/**
 * The website's type scale (--fs-* and DESIGN.md) at phone width, in dp. The app has
 * Archivo's static weights only, so there's no condensed width; display type is uppercase.
 */
export const type = {
  display: { fontFamily: font.black, fontSize: 34, lineHeight: 36, letterSpacing: -0.5 },
  h2: { fontFamily: font.black, fontSize: 21, lineHeight: 24, letterSpacing: -0.3 },
  h3: { fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  caps: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  button: { fontFamily: font.bold, fontSize: 16, lineHeight: 20 },
  quiet: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
} as const;

/** Android's 48dp minimum, which also clears iOS's 44pt. */
export const TOUCH = 48;

/** Strong ease-out for UI, the website's --ease-out. Never ease-in. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** The same curve for CSS-style transitions (transitionTimingFunction). Built when this file
 * loads, so a test on Reanimated's own mock adds `cubicBezier: () => "ease-out"` to it. */
export const EASE_OUT_CSS = cubicBezier(0.23, 1, 0.32, 1);

/** A multiline text box: notes, answers and replies. */
export const multilineInput = {
  minHeight: TOUCH * 2, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
  backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
} as const;

/** The rim round a reply (pink) or a staff-only note (amber), at the given strength. */
export const replyRim = (alpha: number, tone: "reply" | "note" = "reply") =>
  ({ borderColor: tint(tone === "note" ? color.note : color.screen, alpha) }) as const;

/** A palette colour at some strength, for washes and rims ("#e5a00d", 0.16 → "rgba(229, 160, 13, 0.16)"). */
export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
