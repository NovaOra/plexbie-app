// One title: what it is, whether it's on Plex, and (for members) asking for it, with the
// seasons or the book format. Mirrors the website's title page, natively.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../api/client";
import type { AppRequest, AppTitle } from "../../api/schemas";
import type { BookFormat, MediaKind } from "../../api/types";
import { useApi, useSession } from "../../auth/session";
import { useAnnounce, useFocusHere } from "../../ui/announce";
import { BackHeader } from "../../ui/BackHeader";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Poster } from "../../ui/Poster";
import { PressableScale } from "../../ui/Pressable";
import { QueryGate } from "../../ui/QueryGate";
import { Text } from "../../ui/Text";
import { color, font, radius, space } from "../../ui/theme";
import { useArt } from "../art";
import { PushOffer } from "../push/PushRow";
import { KIND_LABEL, formatSlot, home, isBook, stageHelp, stageLabel } from "../requests/stage";
import { newestAired, openSeasons, seasonSummary, seasonsToSend, sendLabel, type SeasonPick } from "./seasons";
import { MoreLikeThis } from "../search/Discover";
import { Ambient, GlassFill, glass } from "../../ui/Glass";

const KINDS: MediaKind[] = ["movie", "tv", "audiobook", "ebook"];

export function TitleScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = KINDS.includes(params.kind as MediaKind) ? (params.kind as MediaKind) : null;
  const id = typeof params.id === "string" ? params.id.slice(0, 200) : "";
  const insets = useSafeAreaInsets();
  const client = useApi();
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  const title = useQuery({
    queryKey: ["title", server, kind, id],
    queryFn: ({ signal }) => client.title(kind!, id, signal),
    enabled: !!kind && !!id,
  });

  if (!kind || !id) {
    return (
      <View style={[styles.page, { paddingBottom: insets.bottom }]}>
        <BackHeader />
        <View style={styles.pad}>
          <Text variant="title" accessibilityRole="alert">Couldn’t load this title.</Text>
          <Text variant="body">That link doesn’t point at a title.</Text>
        </View>
      </View>
    );
  }
  // A failed background refetch keeps the loaded page (and the season pick) on screen.
  if (!title.data) {
    return (
      <View style={[styles.page, { paddingBottom: insets.bottom }]}>
        <BackHeader />
        <View style={styles.pad}>
          <QueryGate query={title} errorTitle="Couldn’t load this title." skeleton={
            <View style={styles.head}>
              <View style={[styles.poster, styles.skeleton]} />
              <View style={{ flex: 1, gap: space.m }}>
                <View style={[styles.skeleton, { height: 28, width: "80%" }]} />
                <View style={[styles.skeleton, { height: 16, width: "55%" }]} />
              </View>
            </View>
          } />
        </View>
      </View>
    );
  }
  // Keyed by title, so a screen reused for another title starts with nothing picked or sent.
  return <Loaded key={`${title.data.kind}/${title.data.id}`} t={title.data} />;
}

function Loaded({ t }: { t: AppTitle }) {
  const insets = useSafeAreaInsets();
  const heading = useFocusHere();
  const backdrop = useArt()(t.backdrop, "w780");
  const book = isBook(t.kind);
  const facts = [
    KIND_LABEL[t.kind], t.year, t.author,
    t.runtime ? `${Math.floor(t.runtime / 60)} h ${t.runtime % 60} min` : null,
    t.seasons?.length ? `${t.seasons.length} season${t.seasons.length === 1 ? "" : "s"}` : null,
    ...(t.genres ?? []).slice(0, 3),
  ].filter(Boolean).join(" · ");
  const plexUrl = t.plexUrl && t.plexUrl.startsWith("https://") ? t.plexUrl : null;
  const leaving = t.leaving && !t.leaving.exempt && typeof t.leaving.daysLeft === "number" ? t.leaving.daysLeft : null;

  return (
    <View style={styles.page}>
      <Ambient />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={[styles.hero, { paddingTop: insets.top + 64 }]}>
          {backdrop ? (
            <>
              <Image source={backdrop} style={StyleSheet.absoluteFill} contentFit="cover" transition={200}
                cachePolicy={backdrop.headers ? "memory" : "memory-disk"} accessibilityIgnoresInvertColors />
              <View style={[StyleSheet.absoluteFill, styles.scrim]} />
            </>
          ) : null}
          <View style={[styles.pad, styles.head]}>
            <Poster poster={t.poster} title={t.title} id={t.id} size="w342" style={styles.poster} />
            <View style={styles.headText}>
              <Text ref={heading} style={styles.name} accessibilityRole="header">{t.title}</Text>
              <Text variant="meta">{facts}</Text>
              {leaving !== null ? (
                <Text variant="meta" style={t.leaving?.warning ? styles.warn : undefined}>
                  {t.leaving?.practice ? "Would leave" : "Leaving"} {home(t.kind)} in {leaving} day{leaving === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        <View style={[styles.pad, styles.body]}>
          {plexUrl ? <Button label="Watch on Plex" onPress={() => void Linking.openURL(plexUrl)} /> : null}
          {t.overview ? <Text variant="body" style={styles.overview}>{t.overview.replace(/\s*[—–]\s*/g, ", ")}</Text> : null}
          <Ask key={`${t.kind}/${t.id}`} t={t} book={book} />
          {t.kind === "movie" || t.kind === "tv" ? <MoreLikeThis kind={t.kind} id={t.id} /> : null}
        </View>
      </ScrollView>
      <BackHeader overlay />
    </View>
  );
}

/** What this member can do about it: their own request, a request form, or why not. */
function Ask({ t, book }: { t: AppTitle; book: boolean }) {
  const client = useApi();
  const qc = useQueryClient();
  const tv = t.kind === "tv";
  const missing = tv ? openSeasons(t) : [];
  const [pick, setPick] = useState<SeasonPick>([]);
  const [format, setFormat] = useState<BookFormat>(t.kind === "ebook" ? "ebook" : "audiobook");
  const send = useMutation({
    mutationFn: () => client.request({ kind: t.kind as MediaKind, id: t.id, seasons: tv ? seasonsToSend(t, pick) : undefined, format: book ? format : undefined }),
    onSuccess: () => {
      haptic.reward();
      void qc.invalidateQueries({ queryKey: ["requests"] });
      void qc.invalidateQueries({ queryKey: ["title"] });
    },
    onError: () => haptic.error(),
  });
  const problem = send.error
    ? send.error instanceof ApiError && send.error.status === 409 ? (tv ? send.error.message : "Someone already asked for this one. It’s in the queue.")
      : send.error instanceof ApiError && (send.error.status === 403 || send.error.status === 503) ? send.error.message
      : "That didn’t go through. Try again, or use /request in Discord."
    : null;

  useAnnounce(problem);
  if (send.data) return <Sent request={send.data} kind={t.kind} />;
  const yours = t.yourRequest && t.yourRequest.stage !== "available" ? t.yourRequest : null;

  return (
    <View style={styles.ask}>
      {yours ? (
        <View style={[styles.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <Text variant="title" accessibilityRole="header">Your request No. {formatSlot(yours.slot)}: {stageLabel(yours.stage, t.kind).toLowerCase()}</Text>
          <Text variant="meta">{stageHelp(yours.stage, t.kind)}.</Text>
          <Button kind="secondary" label="Open your request" style={styles.start}
            onPress={() => router.push({ pathname: "/request/[slot]", params: { slot: String(yours.slot) } })} />
        </View>
      ) : null}

      {t.availability === "blocked" ? (
        <Notice title="Not available to request">An admin has blocked this title, so it can’t be requested.</Notice>
      ) : tv && missing.length ? (
        <View style={[styles.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <SeasonChooser t={t} pick={pick} setPick={setPick} />
          <Text variant="meta">
            {Array.isArray(pick) && !pick.length ? "Tick the seasons you want, or use a button above. " : `You’re asking for ${seasonSummary(pick)}. `}
            An admin approves every request before it’s downloaded.
          </Text>
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <Button label={sendLabel(pick)} busy={send.isPending} busyLabel="Sending…" disabled={Array.isArray(pick) && !pick.length}
            onPress={() => send.mutate()} />
        </View>
      ) : tv && yours ? null
      : tv && (t.seasons ?? []).length ? (
        <Notice title={(t.seasons ?? []).every((s) => s.status === "available" || s.status === "upcoming") ? "Every season is on Plex" : "Nothing left to ask for"}>
          {(t.seasons ?? []).some((s) => s.status === "requested")
            ? "What isn’t on Plex yet is already requested."
            : "New seasons show up here to request when they air."}
        </Notice>
      ) : !tv && yours ? null
      : !tv && t.availability === "available" ? (
        <Notice title={`Already on ${home(t.kind)}`}>If something’s missing, say so in Discord.</Notice>
      ) : !tv && t.availability === "requested" ? (
        <Notice title="Already requested">It’s waiting in the queue, so there’s nothing more to do.</Notice>
      ) : !tv ? (
        <View style={[styles.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          {book ? (
            <>
              <Text variant="title" accessibilityRole="header">Which format?</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {([["audiobook", "Audiobook"], ["ebook", "Ebook"], ["both", "Both"]] as [BookFormat, string][]).map(([f, label]) => (
                  <Chip key={f} label={label} selected={format === f} onPress={() => setFormat(f)} />
                ))}
              </View>
            </>
          ) : null}
          <Text variant="meta">An admin approves every request before it’s downloaded.</Text>
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <Button label={`Request ${t.title}`} busy={send.isPending} busyLabel="Sending…" onPress={() => send.mutate()} />
        </View>
      ) : null}
    </View>
  );
}

function SeasonChooser({ t, pick, setPick }: { t: AppTitle; pick: SeasonPick; setPick: (p: SeasonPick) => void }) {
  const seasons = t.seasons ?? [];
  const open = openSeasons(t).map((s) => s.n);
  const chosen = Array.isArray(pick) ? pick : [];
  const newest = newestAired(t);
  const allMissing = open.length > 0 && chosen.length === open.length;
  const toggle = (n: number) => setPick(chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n].sort((a, b) => a - b));
  return (
    <View style={styles.chooser}>
      <Text variant="title" accessibilityRole="header">{seasons.some((s) => s.status === "available") ? "Want more seasons?" : "Which seasons?"}</Text>
      <View style={styles.chips}>
        {open.length > 1 ? (
          <Chip label={seasons.some((s) => s.status && s.status !== "none") ? "All the missing ones" : "All seasons"}
            selected={allMissing} onPress={() => setPick(open)} />
        ) : null}
        {newest !== null && open.includes(newest) ? (
          <Chip label="Latest + new episodes" selected={pick === "latest"} onPress={() => setPick("latest")} />
        ) : null}
      </View>
      <View accessibilityLabel="Seasons">
        {seasons.map((s) => {
          const can = open.includes(s.n);
          const on = can && (pick === "latest" ? s.n === newest : chosen.includes(s.n));
          const status = s.status ?? "none";
          const state = status === "partial" ? `${s.have ?? 0} of ${s.episodes} on Plex`
            : status === "available" ? "On Plex" : status === "requested" ? "Requested" : status === "upcoming" ? "Not aired yet" : "";
          return (
            <PressableScale
              key={s.n}
              haptic="none"
              disabled={!can}
              onPress={() => (pick === "latest" ? setPick([s.n]) : toggle(s.n))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: status === "available" || on, disabled: !can }}
              accessibilityLabel={`Season ${s.n}, ${s.episodes ? `${s.episodes} episodes` : "no episodes yet"}${state ? `, ${state}` : ""}`}
              style={styles.season}
            >
              <View style={[styles.check, (on || status === "available") && styles.checkOn, status === "available" && styles.checkDone]}>
                {on || status === "available" ? <Text style={[styles.tick, status === "available" && styles.onPlex]}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">Season {s.n}</Text>
                <Text variant="meta">{s.episodes ? `${s.episodes} episodes` : "No episodes yet"}</Text>
              </View>
              {state ? <Text variant="meta" style={status === "available" ? styles.onPlex : undefined}>{state}</Text> : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function Sent({ request: r, kind }: { request: Partial<AppRequest> & { slot: number; stage: string }; kind: string }) {
  // Focus moves to the confirmation that replaced the form, so it's read straight away.
  const heading = useFocusHere(r.slot);
  return (
    <View style={[styles.box, glass.surface, styles.sent]} accessibilityRole="summary" accessibilityLiveRegion="polite">
      <GlassFill radius={radius.m} />
      <Text variant="eyebrow" style={styles.onPlex}>Request sent</Text>
      <Text ref={heading} variant="title" accessibilityRole="header">{r.slot ? `Request No. ${formatSlot(r.slot)} is in` : "Your request is in"}</Text>
      <Text variant="meta">
        An admin gets it in Discord now. You’ll hear when it’s approved or declined
        {kind === "movie" || kind === "tv" ? ", and again when it’s ready to watch." : "."}
      </Text>
      <Button kind="secondary" label="Follow it in My requests" style={styles.start} onPress={() => router.navigate("/requests")} />
      <PushOffer />
    </View>
  );
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <View style={[styles.box, glass.surface]}>
      <GlassFill radius={radius.m} />
      <Text variant="title" accessibilityRole="header">{title}</Text>
      <Text variant="meta">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.field },
  pad: { paddingHorizontal: space.l, gap: space.m },
  start: { alignSelf: "flex-start" },
  hero: { paddingBottom: space.l, overflow: "hidden" },
  scrim: { backgroundColor: "rgba(16, 23, 43, 0.9)" },    // text over the backdrop stays 4.5:1
  head: { flexDirection: "row", alignItems: "flex-end", gap: space.l },
  poster: { width: 112 },
  headText: { flex: 1, gap: space.xs },
  name: { fontFamily: font.black, fontSize: 26, lineHeight: 30 },
  warn: { color: color.tally },
  body: { gap: space.l, paddingTop: space.s },
  overview: { color: color.ink },
  ask: { gap: space.l },
  box: {
    gap: space.m, padding: space.l, borderRadius: radius.m, backgroundColor: color.panel,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule,
  },
  sent: { borderColor: color.screen },
  chooser: { gap: space.m },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  season: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.xs },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: color.screen, borderColor: color.screen },
  checkDone: { backgroundColor: color.panelRaised, borderColor: color.panelRaised },
  tick: { color: color.onScreen, fontFamily: font.bold, fontSize: 15, lineHeight: 18 },
  onPlex: { color: color.screen },
  bad: { color: color.tally },
  skeleton: { backgroundColor: color.panel, borderRadius: radius.s },
});
