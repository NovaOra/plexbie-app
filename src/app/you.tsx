import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../auth/session";
import { useMe } from "../features/me/useMe";
import { Avatar } from "../features/me/Avatar";
import { PushRow } from "../features/push/PushRow";
import { VersionRow } from "../features/update/VersionRow";
import { PressableScale } from "../ui/Pressable";
import { BackHeader } from "../ui/BackHeader";
import { ScreenTitle } from "../ui/ScreenTitle";
import { Text } from "../ui/Text";
import { color, radius, space } from "../ui/theme";
import { Ambient, GlassFill, glass } from "../ui/Glass";

export default function You() {
  const insets = useSafeAreaInsets();
  const { state, signOut } = useSession();
  const sample = state.phase === "signedIn" && state.sample;
  const me = useMe();
  // A token the bot no longer knows is a 401 (handled for every query); "nobody" (null) is treated the same.
  useEffect(() => { if (me.data === null && !sample) void signOut("Your sign-in has ended. Sign in again."); }, [me.data, sample, signOut]);
  const server = state.phase === "signedIn" && !sample ? state.server.replace(/^https:\/\//, "") : null;
  const s = me.data;

  let line: string;
  // The sample's posters are free films' own (Blender Foundation open movies, CC BY; public domain).
  if (sample) line = "Invented people and shows. Film posters: Blender Foundation open movies (CC BY) and public-domain films. Nothing you do here is sent anywhere.";
  else if (me.isPending) line = server ?? "";
  else if (!s) line = me.error ? "Couldn’t check your account just now." : "";
  else line = [s.user.via === "plex" ? "With Plex" : "With Discord", s.admin ? "admin" : null, server].filter(Boolean).join(" · ");

  return (
    <View style={styles.page}>
      <Ambient />
    <BackHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: space.s, paddingBottom: insets.bottom + space.xxl }]}>
      <ScreenTitle>You</ScreenTitle>
      <View style={[styles.card, glass.surface, styles.who]}>
        <GlassFill radius={radius.m} />
        <Avatar name={s?.user.name ?? ""} avatar={s?.user.avatar} size={64} />
        <View style={styles.whoText}>
          <Text variant="eyebrow">{sample ? "Sample household" : "Signed in"}</Text>
          <Text variant="title">{s?.user.name ?? (me.isPending ? " " : "Your account")}</Text>
          <Text variant="meta">{line}</Text>
        </View>
      </View>
      <PushRow />
      <VersionRow />
      <PressableScale onPress={() => signOut()} style={styles.button} accessibilityLabel={sample ? "Leave the sample household" : "Sign out"}>
        <Text variant="label" style={styles.buttonText}>{sample ? "Leave the sample" : "Sign out"}</Text>
      </PressableScale>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clear, so the page's backdrop (behind the Back button too) runs on unbroken.
  scroll: { flex: 1 },
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.l },
  who: { flexDirection: "row", alignItems: "center", gap: space.l },
  whoText: { flex: 1, gap: 4 },
  card: { gap: 4, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  button: { alignSelf: "flex-start", paddingHorizontal: space.xl, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.screen, justifyContent: "center" },
  buttonText: { color: color.screen },
});
