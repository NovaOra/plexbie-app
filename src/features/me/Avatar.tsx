// Your picture: the one Discord or Plex has now (the bot follows changes; the address
// changes with it), in a circle. No picture, or it won't load: your initial.
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../ui/Text";
import { color, font } from "../../ui/theme";
import { useArt } from "../art";

export function Avatar({ name, avatar, size }: { name: string; avatar?: string | null; size: number }) {
  const art = useArt();
  const [broken, setBroken] = useState<string | null>(null);
  const source = avatar && broken !== avatar ? art(avatar) : null;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]} accessible={false}>
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={150}
          // Through the bot (with the token), kept in memory only, never on disk, as posters are.
          cachePolicy={source.headers ? "memory" : "memory-disk"} onError={() => setBroken(avatar ?? null)} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: "hidden", backgroundColor: color.panelRaised, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: font.bold, color: color.screen },
});
