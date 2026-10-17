// Sign-in: the website's TV set. Channel 1 says what Plexbie is (and what the last sign-in
// came back with, as its lower third); channel 2 is how to get in. Your Plexbie's address
// and the two sign-in keys sit on the deck below the screen, and the same steps stay on
// the page under the set. The screen is as tall as channel 1 (and never less than
// SCREEN_MIN), so the keys are in the first view on a phone. Where channel 2's steps are
// taller, the screen grows to show them whole on channel 2 only, and the room it grows
// into is kept under the set on channel 1, so nothing under the set moves. The tally says Standby until a key is
// pressed, and is lit pink only while that sign-in is under way. Reduce Motion: the channel
// changes without the flick, the knob jumps, and keys sink by their lip alone.
import * as haptic from "../../ui/haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming,
} from "react-native-reanimated";
import { KEYBOARD_BEHAVIOR, useScrollToField } from "../../ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_SERVER, SignInError, normalizeServer, useSession, type Via } from "../../auth/session";
import { Button } from "../../ui/Button";
import { KeyRow } from "../../ui/KeyRow";
import { PressableScale } from "../../ui/Pressable";
import { StatusBarScrim } from "../../ui/StatusBarScrim";
import { useAnnounce, useFocusHere } from "../../ui/announce";
import { Text } from "../../ui/Text";
import { TOUCH, color, depth, EASE_OUT, font, radius, space, tint, type } from "../../ui/theme";
import { Ambient } from "../../ui/Glass";
import { InviteLinkField } from "./InviteScreen";
import { Antennae, Cabinet, Feet, LitScreen, PlayIcon, RoomGlow, SidePanel, Tally, useBob } from "./OnAirSet";
import { STEPS, noticeFor, type Notice } from "./onAirCopy";

const LOGO = require("../../../assets/brand/plexbie-512.png");
const NAMES: Record<Via, string> = { discord: "Discord", plex: "Plex" };
/** The screen's least height under its readout: channel 2's heading and first step show whole
 *  even where channel 1 is short (a wide phone, a tablet). */
export const SCREEN_MIN = 224;

export function SignInScreen() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { state, signIn, lookAround } = useSession();
  const initial = (state.phase === "signedOut" ? state.server : DEFAULT_SERVER).replace(/^https:\/\//, "");
  // Like Plexbie's setup: your domain becomes plexbie.<your domain>, and "Use a different
  // address" takes any address (a Tailscale name, one you already use). A Plexbie used
  // before is shown with Change.
  const [server, setServer] = useState(initial);
  const [domain, setDomain] = useState("");
  const [mode, setMode] = useState<"domain" | "address">(initial && !initial.startsWith("plexbie.") ? "address" : "domain");
  const [editing, setEditing] = useState(!initial);
  // The domain field takes focus only when switched back to, never on first launch, where
  // the keyboard would cover the invite link and the sample.
  const [switchedBack, setSwitchedBack] = useState(false);
  const [focused, setFocused] = useState(false);
  const fromDomain = (d: string) => {
    const bare = d.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "").replace(/\.$/, "");
    return bare ? (bare.startsWith("plexbie.") ? bare : `plexbie.${bare}`) : "";
  };
  // The key pressed, while its sign-in is under way: the tally is live only then.
  const [busy, setBusy] = useState<Via | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    state.phase === "signedOut" && state.notice ? { role: "alert", lead: "Signed out", text: state.notice } : null);
  useAnnounce(notice?.text);
  // An invite link carries its own Plexbie's address, so it needs nothing typed above.
  const [inviting, setInviting] = useState(false);
  const field = useScrollToField();

  // The channel, and its vertical-hold flick as it changes.
  const [ch, setCh] = useState<1 | 2>(1);
  const flick = useSharedValue(0);
  const flickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flickTimer.current) clearTimeout(flickTimer.current); }, []);
  const tune = useCallback((n: 1 | 2) => {
    if (n === ch) return;
    haptic.select();
    if (reduced) { setCh(n); return; }
    // The picture folds to a line and opens on the new channel (the website's 240ms).
    flick.set(withSequence(withTiming(1, { duration: 96, easing: EASE_OUT }), withTiming(0, { duration: 144, easing: EASE_OUT })));
    if (flickTimer.current) clearTimeout(flickTimer.current);
    flickTimer.current = setTimeout(() => setCh(n), 96);
  }, [ch, reduced, flick]);
  const flicking = useAnimatedStyle(() => ({ opacity: 1 - flick.get() * 0.6, transform: [{ scaleY: 1 - flick.get() * 0.97 }] }));

  const say = (n: Notice) => { setNotice(n); tune(1); };
  const go = async (via: Via) => {
    setNotice(null);
    if (!server.trim()) { say({ role: "alert", lead: "Sign-in problem", text: "Enter your domain, or your Plexbie’s address." }); return; }
    // An address that can't be signed in to (the Plexbie project's own site, say) is said
    // here, before any sign-in starts.
    try { normalizeServer(server); } catch (e) {
      say(noticeFor(e));
      haptic.error();
      return;
    }
    setBusy(via);
    try {
      await signIn(server, via);
      haptic.success();
    } catch (e) {
      if (!(e instanceof SignInError && e.quiet)) {
        say(noticeFor(e));
        haptic.error();
      }
    } finally {
      setBusy(null);
    }
  };

  let shown = server;
  try { shown = normalizeServer(server).replace(/^https:\/\//, ""); } catch { /* shown as typed */ }

  const readout = ch === 2 ? "CH 2 · Getting in" : busy ? `CH 1 · Tuning in to ${NAMES[busy]}` : "CH 1 · Sign in";
  // Each channel's own height: channel 2 taller grows the screen on channel 2, and that much
  // room waits under the set on channel 1 (the reserve), so the page under it never moves.
  const [heights, setHeights] = useState({ one: 0, two: 0 });
  const measure = (which: "one" | "two") => (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setHeights((was) => (was[which] === h ? was : { ...was, [which]: h }));
  };
  const extra = heights.one && heights.two ? Math.max(0, heights.two - Math.max(heights.one, SCREEN_MIN)) : 0;
  const titleRef = useFocusHere();
  const bob = useBob();

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      <Ambient />
      <ScrollView
        ref={field.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <RoomGlow />
          <Antennae />
          <Cabinet>
            <View style={styles.front}>
              <LitScreen style={styles.screenBox}>
                <View>
                  {/* The readout at its longest, unseen and unread: the screen keeps one height whatever
                      it says, so neither changing channel nor a sign-in starting moves the set. */}
                  <View style={[styles.osd, styles.osdGhost]} testID="osd-ghost" pointerEvents="none"
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Text variant="eyebrow" style={styles.readout}>{`CH 1 · Tuning in to ${NAMES.discord}`}</Text>
                    <Tally live />
                  </View>
                  <View style={[styles.osd, styles.osdShown]}>
                    <Text variant="eyebrow" style={styles.readout}>{readout}</Text>
                    <Tally live={!!busy} />
                  </View>
                </View>
                <Animated.View testID="channels" style={[styles.channels, ch === 2 && extra ? { minHeight: heights.two } : null, flicking]}>
                  <Channel on={ch === 1} onLayout={measure("one")}>
                    <Animated.View style={bob}>
                      <Image source={LOGO} style={styles.mascot} accessibilityIgnoresInvertColors accessible={false} />
                    </Animated.View>
                    <Text ref={titleRef} variant="display" accessibilityRole="header" style={styles.title}>Your household’s Plex, on air.</Text>
                    <Text variant="body" style={styles.lede}>Plexbie is your household’s Plex helper. Members sign in below.</Text>
                    {notice ? (
                      <View style={[styles.notice, notice.role === "alert" && styles.noticeAlert]}
                        accessibilityRole={notice.role === "alert" ? "alert" : "text"} accessibilityLiveRegion="polite">
                        <Text variant="eyebrow" style={notice.role === "alert" ? styles.noticeLeadAlert : styles.noticeLead}>{notice.lead}</Text>
                        <Text variant="meta" style={styles.noticeText}>{notice.text}</Text>
                      </View>
                    ) : null}
                  </Channel>
                  <Channel on={ch === 2} over onLayout={measure("two")}>
                    <Text variant="heading" accessibilityRole="header" style={styles.ch2Title}>Getting in</Text>
                    <Steps compact />
                  </Channel>
                </Animated.View>
              </LitScreen>
              <SidePanel channel={ch} />
            </View>

            <View style={styles.deck}>
              {/* The screen's light falling on the deck. */}
              <View pointerEvents="none" style={styles.spill} />
              <View style={styles.server}>
                <Text variant="eyebrow" style={styles.deckEyebrow}>Your Plexbie</Text>
                {editing && mode === "domain" ? (
                  <>
                    <View style={styles.domainRow}>
                      <Text variant="label" style={styles.prefix} accessible={false}>plexbie.</Text>
                      <TextInput
                        value={domain}
                        onChangeText={(t) => { setDomain(t); setServer(fromDomain(t)); }}
                        autoFocus={switchedBack}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        textContentType="URL"
                        returnKeyType="done"
                        placeholder="yourdomain.com"
                        placeholderTextColor={color.faint}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        style={[styles.input, focused && styles.inputFocused, styles.domainInput]}
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
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      style={[styles.input, focused && styles.inputFocused]}
                      accessibilityLabel="Your Plexbie address"
                      accessibilityHint="The web address of your household's Plexbie"
                    />
                    <PressableScale onPress={() => { setMode("domain"); setServer(fromDomain(domain)); setSwitchedBack(true); }} haptic="none" style={styles.switch}
                      accessibilityRole="button">
                      <Text variant="meta" style={styles.change}>Use your plexbie. address instead</Text>
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

              {/* Discord is the one pink key; Plex shares the view, so it's a raised one with its amber mark. */}
              <View style={styles.keys}>
                <View style={styles.keyGroup}>
                  <Button label="Sign in with Discord" onPress={() => go("discord")} busy={busy === "discord"} blocked={busy === "plex"} />
                  <Text variant="meta" style={styles.legend}>For people in the household’s Discord</Text>
                </View>
                <View style={styles.keyGroup}>
                  <Button kind="secondary" label="Sign in with Plex" icon={<PlayIcon />} onPress={() => go("plex")} busy={busy === "plex"} blocked={busy === "discord"} />
                  <Text variant="meta" style={styles.legend}>Already watching on Plex</Text>
                </View>
              </View>

              <ChannelKey ch={ch} onPress={() => tune(ch === 1 ? 2 : 1)} />
            </View>
          </Cabinet>
          <Feet />
        </View>
        {/* The room channel 2 grows into, kept here while channel 1 is on. */}
        {ch === 1 && extra ? <View testID="channel-2-reserve" style={{ height: extra }} /> : null}

        <Text variant="meta" style={styles.small}>
          You sign in on your Plexbie’s own page. The app never sees your Discord or Plex password.
        </Text>

        {inviting ? (
          <View onLayout={field.onLayout} style={styles.invite}>
            <Text variant="eyebrow">Your invite link</Text>
            <InviteLinkField autoFocus onFocus={field.onFocus}
              onInvite={({ server: s, code }) => router.push({ pathname: "/invite", params: { server: s, code } })} />
            <Button kind="quiet" label="Look around with sample data" onPress={lookAround} disabled={!!busy} haptic="none" />
          </View>
        ) : (
          <KeyRow>
            <Button kind="quiet" label="Have an invite link?" onPress={() => setInviting(true)} disabled={!!busy} haptic="none" />
            <Button kind="quiet" label="Look around with sample data" onPress={lookAround} disabled={!!busy} haptic="none" />
          </KeyRow>
        )}

        <View style={styles.band}>
          <Text variant="eyebrow" accessibilityRole="header">Getting in</Text>
          <Steps />
        </View>
      </ScrollView>
      <StatusBarScrim />
    </KeyboardAvoidingView>
  );
}

/** One channel's picture. Channel 1 sets the screen's height; channel 2 (`over`) lies over it
 *  from the top at its own height (the screen grows to it when it's taller). The one not on is
 *  invisible, untouchable and silent to screen readers. */
function Channel({ on, over, onLayout, children }: { on: boolean; over?: boolean; onLayout?: (e: LayoutChangeEvent) => void; children: ReactNode }) {
  return (
    <View
      onLayout={onLayout}
      style={[styles.channel, over && styles.channelOver, !on && styles.channelOff]}
      pointerEvents={on ? "auto" : "none"}
      accessibilityElementsHidden={!on}
      importantForAccessibility={on ? "auto" : "no-hide-descendants"}
      testID={on ? "channel-on" : "channel-off"}
    >
      {children}
    </View>
  );
}

/** The steps to get in: on channel 2, and under the set. */
function Steps({ compact }: { compact?: boolean }) {
  return (
    <View style={compact ? styles.stepsCompact : styles.steps}>
      {STEPS.map((s, i) => (
        <View key={s.title} style={styles.step} accessible accessibilityLabel={`Step ${i + 1}: ${s.title}. ${s.body}`}>
          <View style={styles.stepNo}><Text style={styles.stepNoText}>{i + 1}</Text></View>
          <View style={styles.stepBody}>
            <Text variant="title" style={compact ? styles.stepTitleCompact : undefined}>{s.title}</Text>
            <Text variant="meta" style={compact ? styles.stepTextCompact : undefined}>{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The deck's channel switch: a hollow pill with the other channel's number on a strap. */
function ChannelKey({ ch, onPress }: { ch: 1 | 2; onPress: () => void }) {
  const [down, setDown] = useState(false);
  const label = ch === 1 ? "How to get in" : "Back to sign-in";
  return (
    <PressableScale feel="key" haptic="none" onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)}
      accessibilityLabel={label} accessibilityState={{ expanded: ch === 2 }} style={[styles.chKey, down && styles.chKeyDown]}>
      <View pointerEvents="none" style={[styles.chLip, { height: down ? depth.lipDown : depth.quietLip }]} />
      <View style={styles.chip}><Text variant="eyebrow" style={styles.chipText}>{ch === 1 ? "CH 2" : "CH 1"}</Text></View>
      <Text variant="label" numberOfLines={1} style={[type.quiet, styles.chLabel]}>{label}</Text>
      <View style={styles.chev} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  content: { paddingHorizontal: space.l, gap: space.l },
  front: { flexDirection: "row", gap: space.m },
  screenBox: { flex: 1 },
  osd: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: space.m, rowGap: space.xs },
  osdGhost: { opacity: 0 },
  osdShown: { position: "absolute", top: 0, left: 0, right: 0 },
  readout: { color: color.screen, flexShrink: 0 },
  channels: { minHeight: SCREEN_MIN },
  channel: { gap: space.m },
  // Laid over the first from the top, at its own height.
  channelOver: { position: "absolute", top: 0, left: 0, right: 0 },
  channelOff: { opacity: 0 },
  mascot: { width: 56, height: 56, borderRadius: 14 },
  // Sized for a 360dp phone's screen-in-a-screen: the longest word still fits its line.
  title: { fontSize: 24, lineHeight: 26, color: color.ink },
  lede: { color: color.slateInk },
  notice: { gap: 2, paddingTop: space.s, borderTopWidth: 1, borderColor: tint(color.screen, 0.2) },
  noticeAlert: { borderColor: tint(color.screen, 0.45) },
  noticeLead: { color: color.slateInk },
  noticeLeadAlert: { color: color.screen },
  noticeText: { color: color.ink },
  ch2Title: { color: color.ink, textTransform: "uppercase" },
  deck: {
    padding: space.m, gap: space.l, borderRadius: radius.m, backgroundColor: color.panel, overflow: "hidden",
    borderWidth: 1, borderTopColor: "rgba(3, 6, 18, 0.45)", borderLeftColor: "rgba(3, 6, 18, 0.45)",
    borderBottomColor: "rgba(174, 184, 216, 0.3)", borderRightColor: "rgba(174, 184, 216, 0.3)",
  },
  spill: { position: "absolute", top: 0, left: 0, right: 0, height: 40, backgroundColor: tint(color.screen, 0.05) },
  deckEyebrow: { color: color.slateInk },
  server: { gap: space.xs },
  serverRow: {
    flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.l,
    borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.field,
  },
  serverName: { flex: 1, color: color.ink },
  change: { color: color.screen },
  domainRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  prefix: { color: color.slateInk, fontSize: 16 },
  domainInput: { flex: 1 },
  switch: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center" },
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontSize: 17, fontFamily: font.medium,
  },
  inputFocused: { borderColor: color.screen },
  keys: { gap: space.m },
  keyGroup: { gap: space.xs },
  legend: { textAlign: "center" },
  chKey: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s, minHeight: TOUCH,
    paddingHorizontal: space.l, borderRadius: radius.pill, borderWidth: 1, borderColor: color.slate, overflow: "hidden",
  },
  chKeyDown: { backgroundColor: "rgba(104, 121, 166, 0.12)", borderColor: color.slateInk },
  chLip: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: depth.quietLipColor },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: color.slate },
  chipText: { color: color.screen, fontSize: 11, lineHeight: 14 },
  chLabel: { color: color.ink, flexShrink: 1 },
  chev: { width: 8, height: 8, marginLeft: 2, borderTopWidth: 2, borderRightWidth: 2, borderColor: color.slateInk, transform: [{ rotate: "45deg" }] },
  small: { textAlign: "center" },
  invite: { gap: space.s },
  band: { gap: space.m, paddingTop: space.l, borderTopWidth: 1, borderColor: color.rule },
  steps: { gap: space.l },
  stepsCompact: { gap: space.m },
  step: { flexDirection: "row", gap: space.m },
  stepNo: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  stepNoText: { ...type.caps, color: color.screen, fontVariant: ["tabular-nums"] },
  stepBody: { flex: 1, gap: 2 },
  stepTitleCompact: { fontSize: 16, lineHeight: 20 },
  stepTextCompact: { fontSize: 13, lineHeight: 18 },
});
