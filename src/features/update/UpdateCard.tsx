import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { UPDATE_VERB, installed, useAppUpdate, whatsNew } from "./useAppUpdate";
import { useDownloadUpdate } from "./useDownloadUpdate";
import { GlassFill, glass } from "../../ui/Glass";

/** "Plexbie 1.5.0 is out" on Home: what's new, Download, Not now (until the next version). */
export function UpdateCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { newer, card, dismiss, download } = useAppUpdate();
  const { busy, get } = useDownloadUpdate(download, { keepsSignedIn: true });
  if (!card || !newer) return null;
  const lines = whatsNew(newer.notes);
  return (
    <View style={style}>
    <View style={[styles.card, glass.surface, styles.cardRim]} accessibilityRole="summary">
      <GlassFill radius={radius.m} />
      <Text variant="eyebrow" style={styles.eyebrow}>New version</Text>
      <Text variant="title">Plexbie {newer.version} is out</Text>
      {lines.map((l) => <Text key={l} variant="body">• {l}</Text>)}
      <Text variant="meta">You have {installed.version || "an older version"}. {Math.round((Platform.OS === "ios" ? newer.ios?.size ?? 0 : newer.size) / 1_000_000)} MB.</Text>
      <View style={styles.actions}>
        <Button label={UPDATE_VERB} busy={busy} busyLabel="Opening…" onPress={() => void get()} style={styles.grow}
          accessibilityLabel={`${UPDATE_VERB} Plexbie ${newer.version}`} />
        <Button kind="secondary" label="Not now" onPress={dismiss} style={styles.grow}
          accessibilityLabel={`Not now. Hide this until the next version`} />
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: 1, borderColor: color.screen },
  cardRim: { borderWidth: 1, borderColor: color.screen },
  eyebrow: { color: color.screen },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s },
  grow: { flexGrow: 1 },
});
