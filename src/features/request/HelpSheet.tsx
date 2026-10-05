// "What's wrong with No. 0214?": pick a reason, add a note, and the admins hear about it
// at once (POST /api/requests/{id}/help). A native sheet; the request card updates in place.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRequest } from "../../api/schemas";
import type { HelpReason } from "../../api/types";
import { useApi, useSession } from "../../auth/session";
import { useAnnounce } from "../../ui/announce";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { color, font, radius, space } from "../../ui/theme";
import { formatSlot } from "../requests/stage";
import { useRequests } from "../requests/useRequests";
import { seasonsText } from "./RequestDetail";

const REASONS: [HelpReason, string][] = [
  ["stuck", "Stuck downloading"],
  ["notfound", "Can’t be found"],
  ["quality", "Wrong version or quality"],
  ["episodes", "Wrong or missing episodes"],
  ["playback", "Won’t play on Plex"],
  ["other", "Something else"],
];

export function HelpSheet() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const insets = useSafeAreaInsets();
  const { data } = useRequests();
  const r = data?.find((x) => String(x.slot) === slot);
  const client = useApi();
  const { state } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState<HelpReason | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");

  const ask = useMutation({
    mutationFn: () => client.askHelp(r!.id!, reason!, note.trim()),
    onSuccess: (out) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The card shows "Help asked" straight away; the next poll confirms it.
      qc.setQueryData<AppRequest[]>(["requests", state.phase === "signedIn" ? state.server : ""],
        (rows) => rows?.map((x) => (x.slot === r!.slot ? { ...x, help: out.help } : x)));
      toast({ text: "Sent to the admins", detail: out.message || undefined });
      router.back();
    },
    onError: (e) => setProblem(e.message || "That didn’t send. Try again in a minute."),
  });

  useAnnounce(problem);                  // before any early return: hooks run in the same order every render
  if (!r?.id) {
    return (
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
        <Text variant="title">This request can’t take a help request.</Text>
        <Button kind="secondary" label="Close" onPress={() => router.back()} style={styles.start} />
      </View>
    );
  }

  const send = () => {
    if (!reason) return;
    if (reason === "other" && !note.trim()) { setProblem("Say a little about what’s wrong."); return; }
    setProblem("");
    ask.mutate();
  };
  const seasons = seasonsText(r.seasons);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + space.l }]} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header" style={styles.heading}>What’s wrong with No. {formatSlot(r.slot)}?</Text>
        <Text variant="meta">{r.title.title}{seasons ? ` (${seasons})` : ""}. The admins get this straight away, with what Plexbie can see right now.</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="What's wrong">
          {REASONS.map(([id, label]) => <Chip key={id} label={label} selected={reason === id} onPress={() => setReason(id)} />)}
        </View>
        <Text variant="label" nativeID="help-note">
          Anything else? <Text variant="meta">{reason === "other" ? "(needed)" : "(optional)"}</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={600}
          placeholder="It’s been at 0% since this morning"
          placeholderTextColor={color.faint}
          accessibilityLabel={`Anything else, ${reason === "other" ? "needed" : "optional"}`}
          accessibilityLabelledBy="help-note"
          style={styles.note}
        />
        {problem ? <Text variant="meta" style={styles.bad} accessibilityRole="alert">{problem}</Text> : null}
        <Button label={reason ? "Send to the admins" : "Pick what’s wrong"} disabled={!reason} busy={ask.isPending} busyLabel="Sending…" onPress={send} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: space.l, paddingTop: space.xl, gap: space.m, backgroundColor: color.panel },
  heading: { fontSize: 20, lineHeight: 26 },
  start: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  note: {
    minHeight: 96, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: color.slate, backgroundColor: color.field,
    color: color.ink, fontFamily: font.regular, fontSize: 16, textAlignVertical: "top",
  },
  bad: { color: color.tally },
});
