// A poster or cover from the bot's address for it, or a code-drawn cover when there's none
// or it won't load:
// the same six gradients as the website (a title gets the same colours in both), with the
// title on covers big enough to read it and two-letter initials on small thumbnails.
// Everything is sized by the cover's own width, so it looks composed at any size.
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { useArt } from "../features/art";
import { color, font, radius } from "./theme";

export function Poster({ poster, title, id, size = "w185", style }: {
  poster: string | null | undefined; title: string; id: string; size?: "w185" | "w342"; style?: StyleProp<ViewStyle>;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const found = useArt()(poster, size);
  // Offline, the bot's posters don't load: the drawn cover stands in, until a new address.
  const art = found && broken !== found.uri ? found : null;
  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={id}
          // Member-only posters (with the token) stay in memory, never on disk.
          cachePolicy={art.headers ? "memory" : "memory-disk"} onError={() => setBroken(art.uri ?? null)} />
      ) : (
        <DrawnCover title={title} />
      )}
    </View>
  );
}

/** The website's cover gradients (web/src/styles.css, .art-fallback--0…5). */
const GRADIENTS = [
  ["#ff5c93", "#3b2a6b"], ["#8e9cc6", "#1d2747"], ["#ffd1e4", "#b04a7c"],
  ["#e5a00d", "#6b2f1d"], ["#5fc4b8", "#17345a"], ["#c48bff", "#2b1d4f"],
] as const;
/** The light pink one carries dark type. */
const LIGHT = 2;
/** Below this width a title can't be read, so the cover shows initials. */
const SMALL = 85;

/** The same pick as the website's, so a title is the same colour everywhere. */
function shade(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % GRADIENTS.length;
}

function initialsOf(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").split(/[\s:&-]+/).filter(Boolean)
    .slice(0, 2).map((w) => [...w][0]).join("").toUpperCase();
}

function DrawnCover({ title }: { title: string }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const which = shade(title);
  const ink = which === LIGHT ? styles.inkDark : styles.inkLight;
  const small = width > 0 && width < SMALL;
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <LinearGradient colors={GRADIENTS[which]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* A soft disc low on the cover, like the website's; the title sits above it. */}
      <View style={[styles.disc, width ? { width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, right: -width * 0.22, bottom: -width * 0.12 } : null]} />
      {width === 0 ? null : small ? (
        <View style={styles.centre}>
          <Text style={[styles.initials, ink, { fontSize: Math.round(width * 0.38) }]} maxFontSizeMultiplier={1} numberOfLines={1}>
            {initialsOf(title)}
          </Text>
        </View>
      ) : (
        <Text
          style={[styles.title, ink, { margin: Math.round(width * 0.09), fontSize: Math.min(24, Math.max(11, Math.round(width * 0.13))) }]}
          // Cover art, not reading text: sized to the cover, never by the system text size.
          maxFontSizeMultiplier={1} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.7}
          textBreakStrategy="balanced" android_hyphenationFrequency="none">
          {title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { aspectRatio: 2 / 3, borderRadius: radius.s, overflow: "hidden", backgroundColor: color.panelRaised },
  disc: { position: "absolute", backgroundColor: "rgba(255, 255, 255, 0.08)" },
  centre: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.black, letterSpacing: -0.2 },
  initials: { fontFamily: font.black, letterSpacing: -0.5 },
  inkLight: { color: color.ink, textShadowColor: "rgba(3, 6, 18, 0.35)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  inkDark: { color: "#1a0710", textShadowColor: "rgba(255, 255, 255, 0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
