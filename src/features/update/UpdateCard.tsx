import { useState } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, radius, space } from "../../ui/theme";
import { UPDATE_VERB, installed, useAppUpdate, whatsNew } from "./useAppUpdate";
import { GlassFill, glass } from "../../ui/Glass";

/** "Plexbie 1.5.0 is out" on Home: what's new, Download, Not now (until the next version). */
export function UpdateCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { newer, card, dismiss, download } = useAppUpdate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!card || !newer) return null;
  const lines = whatsNew(newer.notes);
  const get = async () => {
    setBusy(true);
    try {
      const opened = await download();
      toast(typeof opened === "string" ? { text: `Opening ${opened}`, detail: "Plexbie’s update is waiting there. It keeps you signed in." }
        : opened ? { text: "Downloading in your browser", detail: "Open the file when it’s done to install. It keeps you signed in." }
        : Platform.OS === "ios" ? { text: "Update from SideStore", detail: "Open SideStore (or AltStore) and update Plexbie there." }
        : { text: "Nothing to download here", detail: "The sample household has no app to download." });
    } catch {
      toast({ text: "Couldn’t start the download", detail: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };
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
