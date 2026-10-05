import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, radius, space } from "../../ui/theme";
import { UPDATE_VERB, installed, useAppUpdate } from "./useAppUpdate";
import { GlassFill, glass } from "../../ui/Glass";

/** In You: which version this is, and a download when there's a newer one (even after "Not now"). */
export function VersionRow() {
  const { newer, download } = useAppUpdate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const get = async () => {
    setBusy(true);
    try {
      const opened = await download();
      toast(typeof opened === "string" ? { text: `Opening ${opened}`, detail: "Plexbie’s update is waiting there." }
        : opened ? { text: "Downloading in your browser", detail: "Open the file when it’s done to install." }
        : Platform.OS === "ios" ? { text: "Update from SideStore", detail: "Open SideStore (or AltStore) and update Plexbie there." }
        : { text: "Nothing to download here", detail: "The sample household has no app to download." });
    } catch {
      toast({ text: "Couldn’t start the download", detail: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, glass.surface]}>
      <GlassFill radius={radius.m} />
      <Text variant="eyebrow">App</Text>
      <Text variant="body">Plexbie {installed.version}{newer ? `. Version ${newer.version} is out.` : ", the newest version."}</Text>
      {newer ? <Button label={`${UPDATE_VERB} to ${newer.version}`} busy={busy} busyLabel="Opening…" onPress={() => void get()} style={styles.start} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  start: { alignSelf: "flex-start", marginTop: space.s },
});
