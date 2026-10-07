// An invite link, used in the app: who it's from and whether it still works (asked of the
// server it came from), then a Plex sign-in that accepts it, as the website's invite page
// does. Reached from "Have an invite link?" on the sign-in screen, the Join screen, and the
// app's own link, com.plexbie.app://invite?server=https%3A%2F%2Fplexbie.example.com&code=…
// (web invite links open the website: a household's own domain can't be tied to the app).
//
// Signed in or not, the screen stays: using the invite signs this phone out first, and the
// answer (invite=ok|already|email|unconfirmed|invalid|failed) is shown here afterwards.
import * as haptic from "../../ui/haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, pub } from "../../api/client";
import type { AppInviteCheck } from "../../api/schemas";
import { SignInError, normalizeServer, useSession } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { KEYBOARD_BEHAVIOR } from "../../ui/keyboard";
import { ScreenTitle } from "../../ui/ScreenTitle";
import { Text } from "../../ui/Text";
import { TOUCH, color, font, radius, space } from "../../ui/theme";
import { Ambient } from "../../ui/Glass";

export interface InviteLink { server: string; code: string }

// The bot's links are <its address>/invite/<code>; found inside a longer message too.
const INVITE_LINK = /((?:https?:\/\/)?[^\s/?#]+)\/invite\/([A-Za-z0-9_-]{8,128})(?![A-Za-z0-9_-])/i;
const CODE = /^[A-Za-z0-9_-]{8,128}$/;

/** "https://plexbie.example.com/invite/…" → its server and code. A SignInError says what's wrong. */
export function parseInviteLink(text: string): InviteLink {
  const m = text.match(INVITE_LINK);
  if (!m) throw new SignInError("That isn’t an invite link. They look like https://plexbie.example.com/invite/…");
  return { server: normalizeServer(m[1]), code: m[2] };
}

/** The app's own link: both parts there and well-formed, or nothing. */
function fromLink(server: unknown, code: unknown): InviteLink | null {
  if (typeof server !== "string" || typeof code !== "string" || !CODE.test(code)) return null;
  try { return { server: normalizeServer(server), code }; } catch { return null; }
}

const OUTCOMES: Record<string, { ok: boolean; title: string; text: string; again?: boolean }> = {
  ok: { ok: true, title: "You’re in.", text: "Welcome to the household Plex! Open the Plex app and it’s all there." },
  already: { ok: true, title: "Welcome back.", text: "You already have access, so the invite wasn’t needed." },
  email: { ok: false, again: true, title: "A different Plex account",
    text: "That invite is for a different Plex account. Sign in with the account it was made for, or ask for a new link." },
  unconfirmed: { ok: false, again: true, title: "Confirm your email first",
    text: "Confirm your email with Plex first, then open your invite link again; it still works." },
  invalid: { ok: false, title: "This invite link doesn’t work",
    text: "That invite link doesn’t work any more. Ask whoever sent it for a new one." },
  failed: { ok: false, again: true, title: "Not yet",
    text: "Plex didn’t accept the invite just now. Open your invite link again in a minute; it still works." },
};
// Signed in, but the server said nothing about the invite: it may have been used on an earlier
// try that didn't finish signing in, or stopped working in between.
const UNUSED = { ok: false, again: true, title: "No word on the invite",
  text: "You’re signed in, but Plexbie didn’t say how the invite went. If Plex hasn’t emailed you an invitation, ask whoever sent the link for a new one." };
const outcomeOf = (key: string) => (Object.prototype.hasOwnProperty.call(OUTCOMES, key) ? OUTCOMES[key] : UNUSED);

/** A paste field for an invite link; `onInvite` gets its server and code. */
export function InviteLinkField({ onInvite, autoFocus, onFocus }: { onInvite: (i: InviteLink) => void; autoFocus?: boolean; onFocus?: () => void }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  useAnnounce(problem);
  const open = () => {
    setProblem(null);
    try {
      onInvite(parseInviteLink(text));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That isn’t an invite link.");
      haptic.error();
    }
  };
  return (
    <View style={styles.field}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={open}
        onFocus={onFocus}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        placeholder="https://plexbie.example.com/invite/…"
        placeholderTextColor={color.faint}
        style={[styles.input, problem ? styles.inputBad : null]}
        accessibilityLabel="Invite link"
        accessibilityHint="Paste the invite link you were sent"
      />
      {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
      <Button kind="secondary" label="Open the invite" onPress={open} disabled={!text.trim()} />
    </View>
  );
}

type Check = { phase: "checking" } | { phase: "done"; info: AppInviteCheck } | { phase: "error"; message: string; old: boolean };

export function InviteScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ server?: string; code?: string }>();
  const { state, signIn, signOut } = useSession();
  const [invite, setInvite] = useState<InviteLink | null>(() => fromLink(params.server, params.code));
  const broken = !invite && (params.server !== undefined || params.code !== undefined);
  const [check, setCheck] = useState<Check>({ phase: "checking" });
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // What the server said about the invite after the sign-in; null before, "" when it said nothing.
  const [outcome, setOutcome] = useState<string | null>(null);
  useAnnounce(problem);

  // Another app link while this screen is open: that invite instead.
  useEffect(() => {
    const next = fromLink(params.server, params.code);
    if (!next || (invite && invite.server === next.server && invite.code === next.code)) return;
    setInvite(next);
    setOutcome(null);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.server, params.code]);

  useEffect(() => {
    if (!invite) return;
    let live = true;
    setCheck({ phase: "checking" });
    pub.inviteCheck(invite.server, invite.code).then(
      (info) => { if (live) setCheck({ phase: "done", info }); },
      (e) => {
        if (!live) return;
        // A Plexbie from before the app could use invites: the link still works in a browser.
        const old = e instanceof ApiError && (e.status === 404 || e.status === 405);
        setCheck({ phase: "error", old, message: e instanceof ApiError ? e.message : "Couldn’t reach the server." });
      },
    );
    return () => { live = false; };
  }, [invite, tries]);

  const signedIn = state.phase === "signedIn";
  const use = async () => {
    if (!invite) return;
    setProblem(null);
    setBusy(true);
    try {
      // One sign-in on the phone at a time: the one there now ends properly first.
      if (state.phase === "signedIn") await signOut();
      const back = await signIn(invite.server, "plex", { invite: invite.code });
      setOutcome(back.invite ?? "");
      if (outcomeOf(back.invite ?? "").ok) haptic.success(); else haptic.error();
    } catch (e) {
      if (e instanceof SignInError && e.invite !== undefined) {
        // The invite was answered, but the app's own sign-in didn't finish.
        setOutcome(e.invite);
        setProblem(`${e.message} This phone isn’t signed in to Plexbie: Continue, then sign in with Plex.`);
        haptic.error();
      } else if (!(e instanceof SignInError && e.quiet)) {
        setProblem(e instanceof Error ? e.message : "Sign-in didn't work. Try again.");
        haptic.error();
      }
    } finally {
      setBusy(false);
    }
  };

  const host = invite?.server.replace(/^https:\/\//, "");
  let body;
  if (outcome !== null) {
    const m = outcomeOf(outcome);
    body = (
      <>
        <Text variant="eyebrow" style={m.ok ? styles.eyebrow : styles.bad}>{m === UNUSED ? "Signed in" : m.ok ? "Invite used" : "Invite not used"}</Text>
        <ScreenTitle refocusOn={outcome}>{m.title}</ScreenTitle>
        <Text variant="body" accessibilityRole={m.ok ? undefined : "alert"}>{m.text}</Text>
        {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
        <Button label="Continue" onPress={() => router.replace("/")} disabled={busy} />
        {m.again && invite ? (
          <Button kind="secondary" label={signedIn ? "Sign out and try again with Plex" : "Try again with Plex"} busy={busy} busyLabel="Signing in…"
            onPress={() => void use()} />
        ) : null}
      </>
    );
  } else if (!invite) {
    body = (
      <>
        <ScreenTitle>Use an invite link</ScreenTitle>
        <Text variant="body">
          {broken ? "That link to the app doesn’t work. Paste the invite link itself instead." : "Paste the invite link someone in the household sent you."}
        </Text>
        <InviteLinkField onInvite={setInvite} autoFocus />
      </>
    );
  } else if (check.phase === "checking") {
    body = (
      <View style={styles.checking} accessibilityLabel="Checking your invite" accessible>
        <ActivityIndicator color={color.screen} />
        <Text variant="meta">Checking your invite with {host}…</Text>
      </View>
    );
  } else if (check.phase === "error") {
    body = (
      <>
        <ScreenTitle>{check.old ? "Open it in your browser" : "Your invite can’t be checked right now"}</ScreenTitle>
        <Text variant="body">
          {check.old
            ? `${host} can’t take invites in the app yet. Open your invite link in your phone’s browser instead; it works there.`
            : `${check.message} Try again in a few minutes.`}
        </Text>
        {check.old ? null : <Button kind="secondary" label="Try again" onPress={() => setTries((n) => n + 1)} />}
      </>
    );
  } else if (!check.info.valid) {
    body = (
      <>
        <ScreenTitle>This invite link doesn’t work</ScreenTitle>
        <Text variant="body">It may have been used already, cancelled, or expired. Ask whoever sent it for a new one.</Text>
      </>
    );
  } else {
    const { label, inviter, emailLocked, expiresAt } = check.info;
    const date = expiresAt ? new Date(expiresAt) : null;
    const until = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;
    body = (
      <>
        <Text variant="eyebrow" style={styles.eyebrow}>Invite · {host}</Text>
        <ScreenTitle>{label ? `${label}, you’re invited.` : "You’re invited."}</ScreenTitle>
        <Text variant="body">
          {inviter || "Someone in the household"} invited you to the household Plex: their films and shows, on any screen.
          Sign in with Plex and Plexbie accepts the invite for you. No Plex account? You can make a free one there.
        </Text>
        {emailLocked ? (
          <Text variant="meta">This invite is for one Plex account. Sign in with the one {inviter || "they"} have the email for.</Text>
        ) : null}
        {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
        <Button label={signedIn ? "Sign out and sign in with Plex" : "Sign in with Plex"} busy={busy} busyLabel="Signing in…" onPress={() => void use()} />
        <Text variant="meta" style={styles.small}>
          {signedIn ? "This signs this phone out first. " : ""}
          You sign in on {host}’s own page.{until ? ` The link works once, until ${until}.` : ""}
        </Text>
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <BackHeader fallback="/" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, paddingTop: space.s, gap: space.l },
  eyebrow: { color: color.screen },
  checking: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: TOUCH },
  field: { gap: space.s },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.panel, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  inputBad: { borderColor: color.tally },
  bad: { color: color.tally },
  small: { textAlign: "center" },
});
