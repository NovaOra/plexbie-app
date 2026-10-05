// A poster or cover from the bot's address for it, or the title in type when there's none.
import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useArt } from "../features/art";
import { Text } from "./Text";
import { color, radius, space } from "./theme";

export function Poster({ poster, title, id, size = "w185", style }: {
  poster: string | null | undefined; title: string; id: string; size?: "w185" | "w342"; style?: StyleProp<ViewStyle>;
}) {
  const art = useArt()(poster, size);
  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={id}
          // Member-only posters (with the token) stay in memory, never on disk.
          cachePolicy={art.headers ? "memory" : "memory-disk"} />
      ) : (
        <Text variant="eyebrow" style={styles.text} numberOfLines={4}>{title}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    aspectRatio: 2 / 3, borderRadius: radius.s, overflow: "hidden", backgroundColor: color.panelRaised,
    justifyContent: "flex-end", padding: space.s,
  },
  text: { color: color.slateInk },
});
