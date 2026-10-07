// Manage → Invites: invite links for people without Discord (making the link is the yes),
// Plex invites nobody has accepted yet, and the links already made.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { useState } from "react";
import { Share, StyleSheet, TextInput, View } from "react-native";
import { ApiError } from "../../api/client";
import { checkSignedOut } from "../../api/query";
import type { AppAdminInvite, AppNewInvite, AppPlexInvite } from "../../api/schemas";
import { useApi } from "../../auth/session";
import { useAnnounce, useFocusHere } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/Confirm";
import { Chip } from "../../ui/Chip";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, font, radius, space, TOUCH } from "../../ui/theme";
import { since } from "../requests/stage";
import { AllClear, Heading, Initial, Pill, card } from "./bits";
import { useAct, useAdminKey } from "./useAdmin";
import { GlassFill, glass } from "../../ui/Glass";

const LASTS = [1, 3, 7, 14];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function until(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function InvitesSection() {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const keyOf = useAdminKey();
  const toast = useToast();
  const invites = useQuery({ queryKey: keyOf("invites"), queryFn: ({ signal }) => client.adminInvites(signal), staleTime: 30_000 });
  const plexInvites = useQuery({ queryKey: keyOf("plexinvites"), queryFn: ({ signal }) => client.plexInvites(signal), staleTime: 60_000 });
  const { act } = useAct();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState("");
  const [made, setMade] = useState<AppNewInvite | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);

  const patchInvites = (fn: (d: AppAdminInvite[]) => AppAdminInvite[]) => qc.setQueryData<AppAdminInvite[]>(keyOf("invites"), (d) => (d ? fn(d) : d));

  useAnnounce(problem);
  const create = async () => {
    if (!label.trim()) { setProblem("Give it a name, so you know who it’s for."); return; }
    if (email.trim() && !EMAIL.test(email.trim())) { setProblem("That doesn’t look like an email address."); return; }
    setMaking(true);
    setProblem("");
    try {
      const out = await client.createInvite({ label: label.trim(), email: email.trim() || undefined, days });
      haptic.success();
      setMade(out);
      setLabel("");
      setEmail("");
      patchInvites((d) => [out.invite, ...d]);
    } catch (e) {
      checkSignedOut(e);
      if (e instanceof ApiError && e.unanswered) {
        // It may have been made: the list below shows it once it's in.
        setProblem("No answer yet. It may have gone through: check Open invites below before trying again.");
        await qc.invalidateQueries({ queryKey: keyOf("invites") });
      } else setProblem(e instanceof Error ? e.message : "That didn’t work.");
    } finally {
      setMaking(false);
    }
  };
  const renew = async (i: AppAdminInvite) => {
    setRenewing(i.id);
    try {
      const out = await client.renewInvite(i.id);
      haptic.success();
      setMade(out);
      patchInvites((d) => [out.invite, ...(i.status === "used" ? d : d.filter((x) => x.id !== i.id))]);
      toast({ text: `New link for ${i.label}`, detail: "It’s at the top of Invites, ready to send." });
    } catch (e) {
      checkSignedOut(e);
      if (e instanceof ApiError && e.unanswered) {
        toast({ tone: "error", text: "No answer yet", detail: "It may have gone through. Check before trying again." });
        await qc.invalidateQueries({ queryKey: keyOf("invites") });
      } else toast({ tone: "error", text: "No new link", detail: e instanceof Error ? e.message : undefined });
    } finally {
      setRenewing(null);
    }
  };
  const revoke = (i: AppAdminInvite) =>
    confirm(`Cancel ${i.label}’s invite?`, "The link stops working straight away.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel invite", style: "destructive", onPress: async () => {
        const out = await act(null, () => client.revokeInvite(i.id), { done: (o) => ({ text: `Cancelled ${i.label}’s invite`, detail: o.message || undefined }), refresh: ["invites"] });
        if (out) patchInvites((d) => d.map((x) => (x.id === i.id ? { ...x, status: "revoked" } : x)));
      } },
    ]);
  const remove = (i: AppAdminInvite) =>
    confirm(`Delete ${i.label}’s invite?`, "It’s removed from this list.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const out = await act(null, () => client.deleteInvite(i.id), { done: () => ({ text: `Deleted ${i.label}’s invite` }) });
        if (out) patchInvites((d) => d.filter((x) => x.id !== i.id));
      } },
    ]);

  const rows = invites.data;
  const active = (rows ?? []).filter((i) => i.status === "active");
  const past = (rows ?? []).filter((i) => i.status !== "active");

  return (
    <>
      <Heading title="Invite someone" />
      <Text variant="meta">For people who don’t use Discord. They open the link, sign in with Plex, and they’re in. No approval needed: making the link is your yes.</Text>
      {made ? <FreshLink made={made} onAnother={() => setMade(null)} /> : (
        <View style={[card.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <Text variant="label" nativeID="inv-name">Who’s it for?</Text>
          <TextInput value={label} onChangeText={setLabel} placeholder="Mum" placeholderTextColor={color.faint} maxLength={60} returnKeyType="next"
            accessibilityLabel="Who’s it for?" accessibilityLabelledBy="inv-name" style={styles.input} />
          <Text variant="label" nativeID="inv-email">Their Plex email <Text variant="meta">(optional)</Text></Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={color.faint}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void create()}
            accessibilityLabel="Their Plex email, optional" accessibilityLabelledBy="inv-email" style={styles.input} />
          <Text variant="meta">Locks the link to that Plex account, so a forwarded link won’t work for anyone else.</Text>
          <Text variant="label">Link works for</Text>
          <View style={card.pills} accessibilityRole="radiogroup" accessibilityLabel="Link works for">
            {LASTS.map((d) => <Chip key={d} label={d === 1 ? "1 day" : `${d} days`} selected={days === d} onPress={() => setDays(d)} />)}
          </View>
          {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
          <Button label="Make invite link" busy={making} busyLabel="Making it…" onPress={() => void create()} />
        </View>
      )}

      <PlexInvites rows={plexInvites.data ?? []} />

      <Heading title="Open invites" count={active.length} />
      {!rows ? (invites.error ? <Text variant="body">{invites.error.message}</Text> : <View style={[card.box, { height: 100 }]} />)
        : active.length ? active.map((i) => (
          <View key={i.id} style={[card.box, glass.surface]}>
            <GlassFill radius={radius.m} />
            <View style={card.top}>
              <Initial name={i.label} />
              <View style={card.body}>
                <Text variant="title">{i.label}</Text>
                {i.email ? <Pill label="Locked to their email" tone="safe" /> : null}
                <Text variant="meta">Expires {until(i.expiresAt)} · made by {i.createdBy ?? "an admin"} {since(i.createdAt)}{i.email ? ` · for ${i.email}` : ""}</Text>
              </View>
            </View>
            <View style={card.actions}>
              <Button kind="secondary" label="New link" busy={renewing === i.id} busyLabel="Making it…" onPress={() => void renew(i)} style={card.grow}
                accessibilityLabel={`New link for ${i.label}`} />
              <Button kind="danger" label="Cancel" onPress={() => revoke(i)} style={card.grow} accessibilityLabel={`Cancel ${i.label}’s invite`} />
            </View>
          </View>
        )) : <AllClear title="No open invites">Make one above when someone needs to get in without Discord.</AllClear>}

      {past.length ? (
        <>
          <Heading title="Earlier" />
          <Text variant="meta">Lost a link, or it ran out? Make a new one for the same person. Used invites stay as a record of who joined.</Text>
          {past.map((i) => (
            <View key={i.id} style={[card.box, glass.surface, styles.past]}>
              <GlassFill radius={radius.m} />
              <View style={card.top}>
                <Initial name={i.label} />
                <View style={card.body}>
                  <Text variant="title">{i.label}</Text>
                  <Pill label={i.status === "revoked" ? "Cancelled" : i.status === "used" ? "Used" : "Expired"} tone={i.status === "used" ? "ok" : "plain"} />
                  <Text variant="meta">
                    {i.status === "used" && i.usedBy ? `Joined as ${i.usedBy}${i.usedAt ? ` ${since(i.usedAt)}` : ""}` : `Made by ${i.createdBy ?? "an admin"} ${since(i.createdAt)}`}
                    {i.email ? ` · for ${i.email}` : ""}
                  </Text>
                </View>
              </View>
              <View style={card.actions}>
                <Button kind="secondary" label={i.status === "used" ? "Invite again" : "New link"} busy={renewing === i.id} busyLabel="Making it…"
                  onPress={() => void renew(i)} style={card.grow} accessibilityLabel={`${i.status === "used" ? "Invite again" : "New link"} for ${i.label}`} />
                {i.status === "used" ? null : <Button kind="danger" label="Delete" onPress={() => remove(i)} style={card.grow} accessibilityLabel={`Delete ${i.label}’s invite`} />}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

/** The new link, shown once: send it with the phone's own share sheet (which can also copy it). */
function FreshLink({ made, onAnother }: { made: AppNewInvite; onAnother: () => void }) {
  // It replaced the form: focus moves to it, so "Invite ready" is read straight away.
  const heading = useFocusHere(made.url);
  const send = () => void Share.share({
    title: "Your invite to the household Plex",
    message: `Here’s your invite to our Plex, ${made.invite.label}. Open it and sign in with Plex (it’s free if you don’t have an account yet).\n${made.url}`,
  });
  return (
    <View style={[card.box, glass.surface, styles.fresh]} accessibilityLiveRegion="polite">
      <GlassFill radius={radius.m} />
      <Text variant="eyebrow" style={styles.freshEyebrow}>Invite ready</Text>
      <Text ref={heading} variant="title" accessibilityRole="header" accessibilityLabel={`Invite ready for ${made.invite.label}`}>For {made.invite.label}</Text>
      <Text variant="meta" selectable numberOfLines={2} style={styles.url}>{made.url}</Text>
      <Text variant="meta">Opens on {new URL(made.url).host}.</Text>
      <Button label="Send it" onPress={send} />
      <Text variant="meta">
        Works once, until {shortDate(made.invite.expiresAt)}{made.invite.email ? `, and only for the Plex account with ${made.invite.email}` : ""}.
        {" "}This is the only time you’ll see the link, so send it now.
      </Text>
      <Button kind="secondary" label="Make another" onPress={onAnother} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

/** Invites sent on plex.tv that nobody has accepted: fix a wrong address, or take one back. */
function PlexInvites({ rows }: { rows: AppPlexInvite[] }) {
  const confirm = useConfirm();
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey()("plexinvites");
  const { isBusy, act } = useAct();
  const [editing, setEditing] = useState<string | null>(null);
  const [next, setNext] = useState("");
  if (!rows.length) return null;
  const patch = (fn: (d: AppPlexInvite[]) => AppPlexInvite[]) => qc.setQueryData<AppPlexInvite[]>(key, (d) => (d ? fn(d) : d));

  const change = async (i: AppPlexInvite) => {
    const out = await act(i.email, () => client.plexInviteChange(i.email, next.trim()), { failText: "Not sent", refresh: ["plexinvites"] });
    if (!out) return;
    patch((d) => d.map((x) => (x.email === i.email ? { ...x, email: next.trim(), sentAt: new Date().toISOString() } : x)));
    setEditing(null);
    setNext("");
  };
  const cancel = (i: AppPlexInvite) =>
    confirm(`Cancel the Plex invite to ${i.who || i.email}?`, "The invite on plex.tv is withdrawn.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel invite", style: "destructive", onPress: async () => {
        const out = await act(null, () => client.plexInviteCancel(i.email));
        if (out) patch((d) => d.filter((x) => x.email !== i.email));
      } },
    ]);

  return (
    <>
      <Heading title="Waiting on Plex" count={rows.length} />
      <Text variant="meta">Plex invites nobody has accepted yet. Sent to the wrong address? Change it and the invite goes to the right one.</Text>
      {rows.map((i) => (
        <View key={i.email} style={[card.box, glass.surface]}>
          <GlassFill radius={radius.m} />
          <View style={card.top}>
            <Initial name={i.who || i.email} />
            <View style={card.body}>
              <Text variant="title">{i.who || i.email}</Text>
              <Text variant="meta">{i.who ? `${i.email} · ` : ""}sent {since(i.sentAt)}</Text>
            </View>
          </View>
          {editing === i.email ? (
            <>
              <TextInput value={next} onChangeText={setNext} placeholder="their Plex email" placeholderTextColor={color.faint} autoFocus
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="The right email" style={styles.input} />
              <View style={card.actions}>
                <Button kind="secondary" label="Back" onPress={() => { setEditing(null); setNext(""); }} style={card.grow} />
                <Button label="Send invite" busy={isBusy(i.email)} busyLabel="Sending…" disabled={!EMAIL.test(next.trim())}
                  onPress={() => void change(i)} style={card.grow} />
              </View>
            </>
          ) : (
            <View style={card.actions}>
              <Button kind="secondary" label="Change email" onPress={() => { setEditing(i.email); setNext(""); }} style={card.grow}
                accessibilityLabel={`Change email for ${i.who || i.email}`} />
              <Button kind="danger" label="Cancel" onPress={() => cancel(i)} style={card.grow} accessibilityLabel={`Cancel the Plex invite to ${i.who || i.email}`} />
            </View>
          )}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH, paddingHorizontal: space.l, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate,
    backgroundColor: color.field, color: color.ink, fontFamily: font.regular, fontSize: 16,
  },
  bad: { color: color.tally },
  fresh: { borderColor: color.screen },
  freshEyebrow: { color: color.screen },
  url: { color: color.ink, fontFamily: font.medium },
  past: { opacity: 0.85 },
});
