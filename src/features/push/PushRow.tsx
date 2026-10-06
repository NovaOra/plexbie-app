// "Phone alerts" with a switch: on the You screen, and offered once after a request.
import { Linking, Platform, StyleSheet, View } from "react-native";
import { useApi, useSession } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { SwitchRow } from "../../ui/SwitchRow";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { color, radius, space } from "../../ui/theme";
import { usePush } from "./usePush";
import { useState } from "react";
import { hapticsOn, setHapticsOn } from "../../ui/haptics";
import { refreshPush } from "./push";
import { liveAvailable, liveOn, previewLive, setLiveOn } from "./live";
import { canPromote } from "../../../modules/plexbie-live";
import { GlassFill, glass } from "../../ui/Glass";

const WHY = "When a request is approved, declined or ready, and when your access needs attention. Your Plexbie server is given this phone’s push address.";

const IPHONE = Platform.OS === "ios";
/** Why an iPhone build from SideStore can't get the app's alerts, and what works instead. */
const IPHONE_WHY = "Apple only lets apps from its paid developer program get alerts, so this iPhone build can’t. "
  + "Your Plexbie’s website can: open it in Safari, tap Share, then Add to Home Screen, and turn on alerts there.";

/** A Plexbie that doesn't send app alerts: its website does, on any phone. */
const SERVER_WHY = "Your Plexbie doesn’t send alerts to the app. Its website can: open it in your browser and turn alerts on there.";

export function PushRow() {
  const { status, serverOff, busy, problem, set } = usePush();
  const { state } = useSession();
  const site = state.phase === "signedIn" && !state.sample ? state.server : null;
  useAnnounce(problem);
  if (status === null) return null;
  return (
    <View style={[styles.card, glass.surface]}>
      <GlassFill radius={radius.m} />
      {status === "on" || status === "off" ? (
        <SwitchRow label="Phone alerts" value={status === "on"} disabled={busy} onValueChange={(on) => void set(on)}>
          <Text variant="title">Phone alerts</Text>
          <Text variant="meta">{WHY}</Text>
        </SwitchRow>
      ) : (
        <View style={{ gap: 2 }}>
          <Text variant="title" accessibilityRole="header">Phone alerts</Text>
          <Text variant="meta">{status === "unavailable" ? (serverOff ? SERVER_WHY : IPHONE ? IPHONE_WHY : "Not set up in this build of the app yet.")
            : "Turned off for Plexbie in your phone’s settings."}</Text>
        </View>
      )}
      {status === "unavailable" && (IPHONE || serverOff) && site ? (
        <Button kind="secondary" label={IPHONE ? "Open alerts in Safari" : "Open alerts in your browser"} onPress={() => void Linking.openURL(`${site}/alerts`)}
          style={styles.start} />
      ) : null}
      {status === "denied" ? <Button kind="secondary" label="Open settings" onPress={() => void Linking.openSettings()} style={styles.start} /> : null}
      {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
    </View>
  );
}

const VIBRATION_WHY = Platform.OS === "android"
  ? "A little buzz when you tap, send a request or get an answer, and when an alert comes in."
  : "A little tap when you press, send a request or get an answer.";

/** Vibration on or off: the app's haptics, and (Android) whether alerts vibrate. */
export function VibrationRow() {
  const client = useApi();
  const [on, setOn] = useState(hapticsOn);
  return (
    <View style={[styles.card, glass.surface]}>
      <GlassFill radius={radius.m} />
      <SwitchRow label="Vibration" value={on} onValueChange={(next) => {
        setOn(next);
        void setHapticsOn(next).then(() => refreshPush(client));
      }}>
        <Text variant="title">Vibration</Text>
        <Text variant="meta">{VIBRATION_WHY}</Text>
      </SwitchRow>
    </View>
  );
}

/** Live progress on or off (Android): needs alerts, since the updates come the same way. */
export function LiveRow() {
  const client = useApi();
  const { status } = usePush();
  const [on, setOn] = useState(liveOn);
  if (!liveAvailable || status === null) return null;
  const why = status !== "on" ? "Turn on phone alerts first: live progress comes the same way. “Show me” plays a preview."
    : `While one of your requests downloads, it stays in your notifications${canPromote() ? " and the status bar" : ""}, `
      + "filling up until it’s on Plex. Nothing shows while it’s waiting, and a stuck one goes by itself.";
  return (
    <View style={[styles.card, glass.surface]}>
      <GlassFill radius={radius.m} />
      <SwitchRow label="Live progress" value={on && status === "on"} disabled={status !== "on"} onValueChange={(next) => {
        setOn(next);
        void setLiveOn(next).then(() => refreshPush(client));
      }}>
        <Text variant="title">Live progress</Text>
        <Text variant="meta">{why}</Text>
      </SwitchRow>
      <Button kind="secondary" label="Show me" onPress={() => void previewLive()} style={styles.start} />
    </View>
  );
}

/** After a request: "Get an alert when it's approved?", only while alerts are off. */
export function PushOffer() {
  const { status, busy, set } = usePush();
  if (status !== "off") return null;
  return (
    <View style={styles.offer}>
      <Text variant="meta">Get an alert on this phone when it’s approved or ready?</Text>
      <Button kind="secondary" label="Turn on alerts" busy={busy} onPress={() => void set(true)} style={styles.start} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  start: { alignSelf: "flex-start" },
  bad: { color: color.tally },
  offer: { gap: space.s, paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule },
});
