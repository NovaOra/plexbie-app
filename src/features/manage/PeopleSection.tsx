// Manage → People: everyone the server is shared with, closest to removal first. Rename,
// link or unlink Discord, say which Plex account a missing person really is (a pick, then a
// confirm), keep someone forever (with Undo), or remove them from Plex (after a confirm).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from "react-native";
import { SwitchRow } from "../../ui/SwitchRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppAdminPerson } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Chip } from "../../ui/Chip";
import { PressableScale } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { QueryGate } from "../../ui/QueryGate";
import { color, font, radius, space } from "../../ui/theme";
import { since } from "../requests/stage";
import { AllClear, Heading, Initial, Pill, SearchField, TextField, card, optimistic } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";
import { KEYBOARD_BEHAVIOR } from "../../ui/keyboard";
import type { ToastIn } from "../../ui/Toast";

export function PeopleSection() {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const keyOf = useAdminKey();
  const key = keyOf("people");
  const people = useQuery({ queryKey: key, queryFn: ({ signal }) => client.adminPeople(signal), staleTime: 60_000 });
  const { isBusy, act } = useAct();
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState<AppAdminPerson | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // The Plex account picked for someone, before "That’s them" (and its confirm) sends it.
  const [pick, setPick] = useState<{ plexName: string; account: string } | null>(null);

  const patch = (fn: (d: AppAdminPerson[]) => AppAdminPerson[]) => qc.setQueryData<AppAdminPerson[]>(key, (d) => (d ? fn(d) : d));
  const rows = people.data;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q && rows ? rows.filter((p) => `${p.plexName} ${p.displayName ?? ""} ${p.discordName ?? ""}`.toLowerCase().includes(q)) : rows ?? []),
    [rows, q],
  );

  if (!rows) return <QueryGate query={people} errorTitle="Couldn’t load people." height={200} />;

  const link = async (p: AppAdminPerson, m: { id: string; name: string }, quiet = false, onFail?: (t: ToastIn) => void) => {
    const out = await act(`link:${p.plexName}`, () => client.linkPerson(p.plexName, m.id), {
      done: (o) => (quiet ? null : { text: `Linked ${p.plexName}`, detail: p.tracked === false ? `${o.message} They’re tracked for inactivity from now on.` : o.message || undefined }),
      refresh: ["people"], onFail,
    });
    if (out) patch((d) => d.map((x) => (x.plexName === p.plexName ? { ...x, linked: true, discordName: m.name, discordId: m.id } : x)));
    return !!out;
  };
  const unlink = async (p: AppAdminPerson) => {
    const was = p.discordId ? { id: p.discordId, name: p.discordName ?? "" } : null;
    const out = await act(`unlink:${p.plexName}`, () => client.unlinkPerson(p.plexName), {
      done: (o) => ({ text: `Unlinked ${p.plexName}`, detail: o.message || undefined, action: was ? { label: "Undo", onPress: () => void link(p, was, true) } : undefined }),
    });
    if (out) patch((d) => d.map((x) => (x.plexName === p.plexName ? { ...x, linked: false, discordName: null, discordId: null } : x)));
  };
  const rename = async (p: AppAdminPerson) => {
    const name = newName.trim();
    const out = await act(p.plexName, () => client.renamePerson(p.plexName, name), { refresh: ["people"] });
    if (!out) return;
    patch((d) => d.map((x) => (x.plexName === p.plexName ? { ...x, displayName: name === p.plexName ? null : name } : x)));
    setRenaming(null);
  };
  const keep = async (p: AppAdminPerson, on: boolean) => {
    const them = (d: AppAdminPerson[], fn: (x: AppAdminPerson) => AppAdminPerson) => d.map((x) => (x.plexName === p.plexName ? fn(x) : x));
    // Kept means no longer warned; a failure puts both back as they were. With no answer it
    // may have gone through: People has been reloaded by then, and what the bot says stands.
    let unanswered = false;
    await optimistic(qc, key,
      (d: AppAdminPerson[]) => them(d, (x) => ({ ...x, neverRemove: on, warned: on ? false : x.warned })),
      () => act(null, () => client.keepPerson(p.plexName, on), {
        done: (o) => ({ text: o.message || (on ? "Never removed" : "Back on the check"), action: { label: "Undo", onPress: () => void keep(p, !on) } }),
        refresh: ["people"], onFail: (_, u) => { unanswered = u; },
      }),
      (now, before) => {
        const was = unanswered ? undefined : before.find((x) => x.plexName === p.plexName);
        return was ? them(now, (x) => ({ ...x, neverRemove: was.neverRemove, warned: was.warned })) : now;
      });
  };
  const match = async (p: AppAdminPerson, account: string) => {
    const out = await act(p.plexName, () => client.matchPerson(p.plexName, account), {
      done: (o) => ({ text: `${p.plexName} is ${account} on Plex`, detail: o.message || undefined }), refresh: ["people"],
    });
    if (!out) return;
    patch((d) => d.map((x) => (x.plexName === p.plexName ? { ...x, plexName: account, hasAccess: true, candidates: undefined } : x)));
    setPick(null);
  };
  const confirmMatch = (p: AppAdminPerson, account: string) =>
    confirm(`${p.displayName || p.plexName} is ${account} on Plex?`,
      `Plexbie tracks them as ${account} from now on: what that account watches counts, and the inactivity check goes by it. This can’t be undone from here.`, [
        { text: "Not them", style: "cancel" },
        { text: "That’s them", onPress: () => match(p, account) },
      ]);
  const remove = (p: AppAdminPerson) =>
    confirm(
      p.hasAccess === false ? `Forget ${p.displayName || p.plexName}?` : `Remove ${p.displayName || p.plexName} from Plex?`,
      p.hasAccess === false
        ? "They aren’t on Plex (they never accepted the invite, or already left). Plexbie stops tracking them and takes back an invite that’s still waiting."
        : "Their access to the server ends now, and they’re told. This can’t be undone from here.", [
      { text: "Keep them", style: "cancel" },
      {
        text: p.hasAccess === false ? "Forget" : "Remove", style: "destructive", onPress: async () => {
          const out = await act(p.plexName, () => client.removePerson(p.plexName), { done: (o) => ({ text: p.hasAccess === false ? `Forgot ${p.plexName}` : `Removed ${p.plexName}`, detail: o.message || undefined }) });
          if (out) patch((d) => d.filter((x) => x.plexName !== p.plexName));
        },
      },
    ]);

  return (
    <>
      <Heading title="Who’s on Plex" count={rows.length} />
      <Text variant="meta">Everyone your server is shared with. Closest to removal first; top-three watchers are always safe, and watching anything resets the clock.</Text>
      {rows.length > 4 || query ? (
        <SearchField value={query} onChangeText={setQuery} />
      ) : null}
      {!rows.length ? <AllClear title="Nobody else yet">When you share the server with someone (an invite link, or in Plex), they show up here.</AllClear> : null}
      {shown.map((p) => {
        const name = p.displayName || p.plexName;
        const total = p.removalIn === null ? null : p.daysIdle + p.removalIn;
        const fill = p.removalIn === null ? 1 : total ? Math.min(1, p.daysIdle / total) : 0;
        const tone = p.removalIn === null || p.neverRemove ? "safe" : p.removalIn <= 7 ? "hot" : p.daysIdle >= p.warnAfter ? "warm" : "calm";
        return (
          <View key={p.plexName} style={[card.box, glass.surface, isBusy(p.plexName) && styles.busy]}>
            <GlassFill radius={radius.m} />
            <View style={card.top}>
              <Initial name={name} />
              <View style={card.body}>
                <Text variant="title">{name}</Text>
                {p.displayName ? <Text variant="meta">{p.plexName} on Plex</Text> : null}
                <View style={card.pills}>
                  {p.owner ? <Pill label="Owner" tone="safe" /> : null}
                  {p.topThree ? <Pill label="Top three" tone="safe" /> : null}
                  {p.neverRemove ? <Pill label="Never removed" tone="safe" /> : null}
                  {p.warned ? <Pill label="Warned" tone="bad" /> : null}
                  {p.hasAccess === false ? <Pill label="No longer on Plex" tone="bad" /> : null}
                  {p.tracked === false ? <Pill label="Not tracked" /> : null}
                </View>
                <View style={styles.linkRow}>
                  {p.linked ? (
                    <>
                      <Text variant="meta">Discord: <Text variant="meta" style={styles.ink}>{p.discordName ?? "linked"}</Text></Text>
                      <TextButton label="Unlink" onPress={() => void unlink(p)} disabled={isBusy(`unlink:${p.plexName}`)} a11y={`Unlink Discord, ${name}`} />
                    </>
                  ) : <TextButton label="Link Discord" onPress={() => setLinking(p)} a11y={`Link Discord, ${name}`} />}
                  {p.tracked === false || renaming === p.plexName ? null : (
                    <TextButton label="Rename" onPress={() => { setRenaming(p.plexName); setNewName(name); }} a11y={`Rename, ${name}`} />
                  )}
                </View>
                {p.tracked === false ? null : <Text variant="meta">{p.lastWatched ? `Watched ${since(p.lastWatched)}` : "No watch recorded"}</Text>}
              </View>
            </View>

            {renaming === p.plexName ? (
              <View style={styles.stack}>
                <Text variant="meta">Shown everywhere in Plexbie and in Tautulli. Their Plex username stays {p.plexName}.</Text>
                <TextField value={newName} onChangeText={setNewName} maxLength={40} autoFocus accessibilityLabel={`Display name for ${p.plexName}`}
                  returnKeyType="done" onSubmitEditing={() => { if (newName.trim()) void rename(p); }} />
                <View style={card.actions}>
                  <Button kind="secondary" label="Back" onPress={() => setRenaming(null)} style={card.grow} accessibilityLabel={`Back, keep ${name}`} />
                  <Button label="Save" busy={isBusy(p.plexName)} disabled={!newName.trim()} onPress={() => void rename(p)} style={card.grow}
                    accessibilityLabel={`Save name for ${p.plexName}`} />
                </View>
              </View>
            ) : null}

            {p.hasAccess === false && p.candidates?.length ? (
              <View style={styles.stack}>
                <Text variant="meta">Shared on Plex under another name? Pick the account they really are:</Text>
                <View style={card.pills} accessibilityRole="radiogroup" accessibilityLabel={`Plex account for ${name}`}>
                  {p.candidates.map((c) => (
                    <Chip key={c} label={c} selected={pick?.plexName === p.plexName && pick.account === c}
                      onPress={() => setPick({ plexName: p.plexName, account: c })} accessibilityLabel={`${c}, Plex account for ${name}`} />
                  ))}
                </View>
                {pick?.plexName === p.plexName && p.candidates.includes(pick.account) ? (
                  <Button label="That’s them" busy={isBusy(p.plexName)} onPress={() => confirmMatch(p, pick.account)} style={styles.start}
                    accessibilityLabel={`That’s them: ${pick.account} is ${name}`} />
                ) : null}
              </View>
            ) : null}

            {p.owner ? <Text variant="meta">Owns the server.</Text>
              : p.tracked === false ? <Text variant="meta">Not tracked, so the inactivity check never removes them. To remove them, use Plex’s own sharing settings.</Text>
              : (
                <View style={styles.stack} accessible
                  accessibilityLabel={p.neverRemove ? "Never removed for not watching" : p.removalIn === null ? "Safe while in the top three" : p.removalIn === 0 ? "Due for removal" : `${p.removalIn} days until removal, idle ${p.daysIdle} days`}>
                  <View style={styles.meter}><View style={[styles.meterFill, styles[tone], { width: `${Math.round(fill * 100)}%` }]} /></View>
                  <Text variant="meta">
                    {p.neverRemove ? "Never removed for not watching" : p.removalIn === null ? "Safe while in the top three"
                      : p.removalIn === 0 ? "Due for removal" : `${p.removalIn} days until removal · idle ${p.daysIdle}`}
                  </Text>
                </View>
              )}

            {p.owner || p.tracked === false ? null : (
              <View style={[card.actions, styles.keepRow]}>
                <SwitchRow label={`Never remove, ${name}`} value={!!p.neverRemove} onValueChange={(on) => void keep(p, on)} style={styles.keep}>
                  <Text variant="label">Never remove</Text>
                </SwitchRow>
                <Button kind="danger" label="Remove" disabled={isBusy(p.plexName)} onPress={() => remove(p)} accessibilityLabel={`Remove ${name} from Plex`} />
              </View>
            )}
          </View>
        );
      })}
      {q && !shown.length ? <Text variant="meta">Nobody matches “{query}”.</Text> : null}
      <LinkSheet person={linking} onClose={() => setLinking(null)}
        onPick={async (m) => {
          let why = "";
          const ok = !!linking && (await link(linking, m, false, (t) => { why = t.detail ? `${t.text}. ${t.detail}` : t.text; }));
          if (ok) setLinking(null);
          return ok ? null : why;
        }} />
    </>
  );
}

function TextButton({ label, onPress, a11y, disabled }: { label: string; onPress: () => void; a11y: string; disabled?: boolean }) {
  return (
    <PressableScale haptic="none" onPress={onPress} disabled={disabled} accessibilityLabel={a11y} style={styles.textButton}>
      <Text variant="label" style={styles.textButtonText}>{label}</Text>
    </PressableScale>
  );
}

/** Pick the Discord member a Plex account belongs to: a page sheet with a search. `onPick`
 *  answers null once linked, or why it wasn't ("" when it doesn't know). */
function LinkSheet({ person, onClose, onPick }: {
  person: AppAdminPerson | null; onClose: () => void; onPick: (m: { id: string; name: string }) => Promise<string | null>;
}) {
  const insets = useSafeAreaInsets();
  const client = useApi();
  const key = useAdminKey()("links");
  // Fetched again each time the sheet opens: someone may have been linked since.
  const candidates = useQuery({ queryKey: key, queryFn: ({ signal }) => client.linkCandidates(signal), enabled: !!person, staleTime: 0 });
  const [q, setQ] = useState("");
  const [problem, setProblem] = useState("");
  // One pick at a time: a second tap while the first is being linked isn't a failure.
  const picking = useRef(false);
  useEffect(() => { setProblem(""); setQ(""); }, [person]);
  useAnnounce(problem);
  const words = q.trim().toLowerCase();
  const list = (candidates.data?.discord ?? []).filter((m) => !words || `${m.name} ${m.username}`.toLowerCase().includes(words));
  return (
    <Modal visible={!!person} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* On Android the sheet fills the screen, under the status bar too. On iOS it's a card
          starting below the status bar, and the keyboard's room is measured from the card's
          top, so the offset adds that space back. */}
      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0} style={styles.sheetRoom}>
        <View style={[styles.sheet, { paddingTop: (Platform.OS === "android" ? insets.top : 0) + space.xl, paddingBottom: insets.bottom + space.l }]}>
          <Text variant="title" accessibilityRole="header" style={styles.sheetTitle}>Link {person?.displayName || person?.plexName}</Text>
          <Text variant="meta">Which Discord member is this? Linking keeps Discord and Plex together for requests, alerts and the inactivity check.</Text>
          <SearchField value={q} onChangeText={setQ} label="Search Discord members" />
          {candidates.error ? <Text variant="body">{candidates.error.message}</Text> : null}
          {/* Shown here: a toast would sit behind this sheet. */}
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <FlatList
            data={list}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
            ListEmptyComponent={candidates.data ? <Text variant="meta">Nobody matches.</Text> : <Text variant="meta">Loading members…</Text>}
            renderItem={({ item: m }) => (
              <PressableScale haptic="none" accessibilityLabel={`Link to ${m.name}`} style={styles.member}
                onPress={async () => {
                  if (picking.current) return;
                  picking.current = true;
                  setProblem("");
                  try {
                    const why = await onPick(m);
                    if (why !== null) setProblem(why || `Couldn’t link ${m.name}. Try again.`);
                  } finally { picking.current = false; }
                }}>
                <Initial name={m.name} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{m.name}</Text>
                  {m.username ? <Text variant="meta">@{m.username}</Text> : null}
                </View>
              </PressableScale>
            )}
          />
          <Button kind="secondary" label="Cancel" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  busy: { opacity: 0.6 },
  ink: { color: color.ink, fontFamily: font.semibold },
  linkRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.m },
  textButton: { justifyContent: "center" },
  textButtonText: { color: color.screen, fontSize: 15 },
  stack: { gap: space.s },
  meter: { height: 6, borderRadius: 3, backgroundColor: color.rule, overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3 },
  safe: { backgroundColor: color.screen },
  calm: { backgroundColor: color.slate },
  warm: { backgroundColor: color.screenDeep },
  hot: { backgroundColor: color.tally },
  keepRow: { alignItems: "center", justifyContent: "space-between" },
  keep: { flex: 1 },
  bad: { color: color.tally },
  sheetRoom: { flex: 1, backgroundColor: color.panel },
  sheet: { flex: 1, padding: space.l, gap: space.m },
  sheetTitle: { fontSize: 20, lineHeight: 26 },
  member: { flexDirection: "row", alignItems: "center", gap: space.m, padding: space.s, borderRadius: radius.m, backgroundColor: color.field },
});
