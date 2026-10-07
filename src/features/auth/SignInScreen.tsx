import * as haptic from "../../ui/haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { KEYBOARD_BEHAVIOR, useScrollToField } from "../../ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_SERVER, SignInError, normalizeServer, useSession, type Via } from "../../auth/session";
import { PressableScale } from "../../ui/Pressable";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { useAnnounce } from "../../ui/announce";
import { Text } from "../../ui/Text";
import { TOUCH, color, font, radius, space } from "../../ui/theme";
import { Ambient } from "../../ui/Glass";
import { InviteLinkField } from "./InviteScreen";

const LOGO = require("../../../assets/brand/plexbie-512.png");

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { state, signIn, lookAround } = useSession();
  const initial = (state.phase === "signedOut" ? state.server : DEFAULT_SERVER).replace(/^https:\/\//, "");
  // Like Plexbie's setup: your domain becomes plexbie.<your domain>, and "Use a different
  // address" takes any address (a Tailscale name, one you already use). A Plexbie used
  // before is shown with Change.
  const [server, setServer] = useState(initial);
  const [domain, setDomain] = useState("");
  const [mode, setMode] = useState<"domain" | "address">(initial && !initial.startsWith("plexbie.") ? "address" : "domain");
  const [editing, setEditing] = useState(!initial);
  const fromDomain = (d: string) => {
    const bare = d.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "").replace(/\.$/, "");
    return bare ? (bare.startsWith("plexbie.") ? bare : `plexbie.${bare}`) : "";
  };
  const [busy, setBusy] = useState<Via | null>(null);
  const [problem, setProblem] = useState<string | null>(state.phase === "signedOut" ? state.notice ?? null : null);
  useAnnounce(problem);
  // An invite link carries its own Plexbie's address, so it needs nothing typed above.
  const [inviting, setInviting] = useState(false);
  const field = useScrollToField();

  const go = async (via: Via) => {
    setProblem(null);
    if (!server.trim()) { setProblem("Enter your domain, or your Plexbie’s address."); return; }
    setBusy(via);
    try {
      await signIn(server, via);
      haptic.success();
    } catch (e) {
      if (!(e instanceof SignInError && e.quiet)) {
        setProblem(e instanceof Error ? e.message : "Sign-in didn't work. Try again.");
        haptic.error();
      }
    } finally {
      setBusy(null);
    }
  };

  let shown = server;
  try { shown = normalizeServer(server).replace(/^https:\/\//, ""); } catch { /* shown as typed */ }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView
        ref={field.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors accessible={false} />
        <View style={styles.onAir}>
          <View style={styles.onAirDot} />
          <Text variant="eyebrow" style={styles.onAirText}>On air</Text>
        </View>
        <ScreenTitle>Plexbie</ScreenTitle>
        <Text variant="body" style={styles.lede}>
          Your household’s Plex: ask for films, shows and books, and see each one on its way.
        </Text>

        <View style={styles.server}>
          <Text variant="eyebrow">Your Plexbie</Text>
          {editing && mode === "domain" ? (
            <>
              <View style={styles.domainRow}>
                <Text variant="label" style={styles.prefix} accessible={false}>plexbie.</Text>
                <TextInput
                  value={domain}
                  onChangeText={(t) => { setDomain(t); setServer(fromDomain(t)); }}
                  autoFocus={!initial}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  textContentType="URL"
                  returnKeyType="done"
                  placeholder="yourdomain.com"
                  placeholderTextColor={color.faint}
                  style={[styles.input, styles.domainInput]}
                  accessibilityLabel="Your domain"
                  accessibilityHint="Your Plexbie is at plexbie dot your domain"
                />
              </View>
              <PressableScale onPress={() => { setMode("address"); setServer(server || ""); }} haptic="none" style={styles.switch}
                accessibilityRole="button">
                <Text variant="meta" style={styles.change}>Use a different address</Text>
              </PressableScale>
            </>
          ) : editing ? (
            <>
              <TextInput
                value={server}
                onChangeText={setServer}
                onSubmitEditing={() => { if (server.trim()) setEditing(false); }}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="done"
                placeholder="plexbie.example.com"
                placeholderTextColor={color.faint}
                style={styles.input}
                accessibilityLabel="Your Plexbie address"
                accessibilityHint="The web address of your household's Plexbie"
              />
              <PressableScale onPress={() => { setMode("domain"); setServer(fromDomain(domain)); }} haptic="none" style={styles.switch}
                accessibilityRole="button">
                <Text variant="meta" style={styles.change}>Use plexbie.your domain instead</Text>
              </PressableScale>
            </>
          ) : (
            <PressableScale onPress={() => setEditing(true)} haptic="none" style={styles.serverRow}
              accessibilityLabel={`Your Plexbie: ${shown}. Change`}>
              <Text variant="label" numberOfLines={1} style={styles.serverName}>{shown}</Text>
              <Text variant="label" style={styles.change}>Change</Text>
            </PressableScale>
          )}
        </View>

        {problem ? <Text variant="meta" style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">{problem}</Text> : null}

        <PressableScale onPress={() => go("discord")} disabled={!!busy} style={[styles.button, styles.primary]}
          accessibilityLabel="Sign in with Discord">
          {busy === "discord" ? <ActivityIndicator color={color.onScreen} /> : <Text variant="label" style={styles.primaryText}>Sign in with Discord</Text>}
        </PressableScale>
        <PressableScale onPress={() => go("plex")} disabled={!!busy} style={[styles.button, styles.secondary]}
          accessibilityLabel="Sign in with Plex">
          {busy === "plex" ? <ActivityIndicator color={color.screen} /> : <Text variant="label" style={styles.secondaryText}>Sign in with Plex</Text>}
        </PressableScale>
        <Text variant="meta" style={styles.small}>
          You sign in on your Plexbie’s own page. The app never sees your Discord or Plex password.
        </Text>

        {inviting ? (
          <View onLayout={field.onLayout} style={styles.invite}>
            <Text variant="eyebrow">Your invite link</Text>
            <InviteLinkField autoFocus onFocus={field.onFocus}
              onInvite={({ server: s, code }) => router.push({ pathname: "/invite", params: { server: s, code } })} />
          </View>
        ) : (
          <PressableScale onPress={() => setInviting(true)} disabled={!!busy} haptic="none" style={styles.quiet}>
            <Text variant="label" style={styles.change}>Have an invite link?</Text>
          </PressableScale>
        )}

        <PressableScale onPress={lookAround} disabled={!!busy} haptic="none" style={styles.quiet} accessibilityLabel="Look around with sample data">
          <Text variant="label" style={styles.quietText}>Look around with sample data</Text>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.xl, gap: space.m },
  logo: { width: 88, height: 88, borderRadius: 20, marginBottom: space.l },
  onAir: { flexDirection: "row", alignItems: "center", gap: 6 },
  onAirDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.tally },
  onAirText: { color: color.tally },
  lede: { marginBottom: space.l },
  server: { gap: space.xs, marginBottom: space.s },
  serverRow: {
    flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.l,
    borderRadius: radius.m, borderWidth: 1, borderColor: color.rule, backgroundColor: color.panel,
  },
  serverName: { flex: 1, color: color.ink },
  change: { color: color.screen },
  domainRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  prefix: { color: color.slateInk, fontSize: 16 },
  domainInput: { flex: 1 },
  switch: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center" },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1, borderColor: color.screen,
    backgroundColor: color.panel, color: color.ink, fontSize: 17, fontFamily: font.medium,
  },
  problem: { color: color.screen },
  button: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", minHeight: 54 },
  primary: { backgroundColor: color.screen },
  primaryText: { color: color.onScreen, fontSize: 17 },
  secondary: { borderWidth: 1.5, borderColor: color.screen },
  secondaryText: { color: color.screen, fontSize: 17 },
  small: { textAlign: "center", marginTop: space.xs },
  quiet: { alignItems: "center", justifyContent: "center", marginTop: space.l },
  invite: { gap: space.xs, marginTop: space.l },
  quietText: { color: color.slateInk, textDecorationLine: "underline" },
});
