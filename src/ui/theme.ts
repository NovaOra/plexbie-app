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
  screenDeep: "#f5b3cf",
  onScreen: "#141b30",
  tally: "#ff5c93",        // the red "on air" tally light: live and urgent only
  onTally: "#1a0710",
} as const;

export const font = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_800ExtraBold",
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const radius = { s: 6, m: 12, l: 16, pill: 999 } as const;

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
  ({ borderColor: `rgba(${tone === "note" ? "229, 160, 13" : "255, 209, 228"}, ${alpha})` }) as const;
