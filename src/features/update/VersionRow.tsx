import { StyleSheet, View } from "react-native";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { UPDATE_VERB, installed, useAppUpdate } from "./useAppUpdate";
import { useDownloadUpdate } from "./useDownloadUpdate";
import { GlassFill, glass } from "../../ui/Glass";

/** In You: which version this is, and a download when there's a newer one (even after "Not now"). */
export function VersionRow() {
  const { newer, download } = useAppUpdate();
  const { busy, get } = useDownloadUpdate(download);
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
