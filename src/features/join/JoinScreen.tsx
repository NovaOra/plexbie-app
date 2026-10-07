// Signed in, but not on the Plex server yet. The same rules as the website's Join page:
// a Discord sign-in in the household server asks with an email (like /join-plex); a Plex
// sign-in joins by invite link only (used on the Invite screen); someone outside the
// Discord server is told why.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { KEYBOARD_BEHAVIOR } from "../../ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppSession } from "../../api/schemas";
import { useApi, useSession } from "../../auth/session";
import { announce, useAnnounce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { EMAIL } from "../../ui/format";
import { Ambient } from "../../ui/Glass";

const BAD_EMAIL = "That doesn’t look like an email address.";

export function JoinScreen({ me }: { me: AppSession }) {
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const client = useApi();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = EMAIL.test(email.trim());
  const ask = useMutation({
    mutationFn: () => client.join(email.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["session"] }),
  });
  const viaPlex = me.user.via === "plex";
  const first = me.user.name.split(" ")[0];
  const sent = me.joinPending || ask.isSuccess;

  const blocked = me.accessUnknown
    ? "Plexbie can’t reach Plex right now to check whether you already have access. Give it a minute and check again."
    : viaPlex
      ? `You’re signed in as ${me.plexName ?? "your Plex account"}, which isn’t shared on this server. Joining without Discord is by `
        + "invite only: ask whoever runs the server for an invite link, then use it here and sign in with Plex."
      : me.inGuild === false
        ? "This Discord account isn’t in the household’s Discord server, so Plexbie can’t ask for you from here. Join the "
          + "Discord server first, or ask whoever runs it for an invite link."
        : null;

  useAnnounce(ask.error?.message);
  // The line under the field turns into this. Said out loud as well: when the field is
  // left with a bad address, and on each press of Ask to join. (Not a live region too, or
  // Android would read it twice.)
  const check = (asking: boolean) => {
    if (!valid && (asking || !touched)) announce(BAD_EMAIL);
    setTouched(true);
  };
  const submit = () => {
    check(true);
    if (valid) ask.mutate();
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <Text variant="eyebrow" style={styles.eyebrow}>{sent ? "In the queue" : "Not on Plex yet"}</Text>
        {sent ? (
          <>
            <ScreenTitle>You’re in the queue.</ScreenTitle>
            <Text variant="body">
              An admin will look at it soon. Then Plex emails you an invitation{viaPlex ? "" : ", and Plexbie sends you a DM"}.
              Accept it and come back here to request things.
            </Text>
          </>
        ) : (
          <>
            <ScreenTitle>{first ? `${first}, let’s get you on Plex.` : "Let’s get you on Plex."}</ScreenTitle>
            {blocked ? (
              <>
                <Text variant="body">{blocked}</Text>
                {me.accessUnknown ? <Button kind="secondary" label="Check again" onPress={() => void qc.invalidateQueries({ queryKey: ["session"] })} style={styles.signOut} />
                  : <Button label="I have an invite link" onPress={() => router.push("/invite")} style={styles.signOut} />}
              </>
            ) : (
              <>
                <Text variant="body">
                  You’re in the Discord, but not on the Plex server yet. Give the email you use for Plex (or want to use) and an
                  admin will send you an invite. It’s the same as /{"⁠"}join-plex.
                </Text>
                <View style={styles.field}>
                  <Text variant="label" nativeID="email-label">Email for Plex</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    onBlur={() => check(false)}
                    onSubmitEditing={submit}
                    placeholder="you@example.com"
                    placeholderTextColor={color.faint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    accessibilityLabelledBy="email-label"
                    accessibilityLabel="Email for Plex"
                    style={[styles.input, touched && !valid && styles.inputBad]}
                  />
                  <Text variant="meta" style={touched && !valid ? styles.bad : undefined}>
                    {touched && !valid ? BAD_EMAIL : "Only the admins see it, and only to send the Plex invite."}
                  </Text>
                </View>
                {ask.error ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{ask.error.message}</Text> : null}
                <Button label="Ask to join" busy={ask.isPending} busyLabel="Sending…" onPress={submit} />
              </>
            )}
          </>
        )}
        <Button kind="secondary" label="Sign out" onPress={() => void signOut()} style={styles.signOut} />
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.l },
  eyebrow: { color: color.screen },
  field: { gap: space.s },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.panel, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  inputBad: { borderColor: color.tally },
  bad: { color: color.tally },
  signOut: { alignSelf: "flex-start", marginTop: space.l },
});
