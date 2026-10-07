// The app's own updates: the bot says what its newest version is (it hosts the APK and
// the iPhone build, so phones get them from their own Plexbie); a newer one gets a card on Home and a row in You.
// On Android that downloads the APK. iPhones can't install from a download: SideStore
// or AltStore installs Plexbie and its updates, so there it opens whichever one it is.
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import type { AppRelease } from "../../api/schemas";
import { useApi, useServer, useSession } from "../../auth/session";

const DISMISSED = "plexbie.update.dismissed";

/** This build's version, from the app config it was built with. */
export const installed = {
  version: Constants.expoConfig?.version ?? "",
  code: Number(Constants.expoConfig?.android?.versionCode ?? 0),
};

/** The release notes' "what's new" lines, without Markdown or the install instructions. */
export function whatsNew(notes: string, max = 3): string[] {
  const out: string[] = [];
  for (const raw of notes.split("\n")) {
    const line = raw.replace(/[*_`#>]/g, "").replace(/^\s*[-•]\s*/, "").trim();
    if (/^(installing|checks)\b/i.test(line)) break;
    if (line && !/^new in /i.test(line)) out.push(line);
  }
  return out.slice(0, max);
}

/** The app that installed Plexbie on this iPhone, if it can tell. */
async function iphoneStore(): Promise<{ name: string; url: string } | null> {
  for (const [name, url] of [["SideStore", "sidestore://"], ["AltStore", "altstore://"]] as const) {
    if (await Linking.canOpenURL(url).catch(() => false)) return { name, url };
  }
  return null;
}

/** What getting an update is called here: a download, or SideStore/AltStore's update. */
export const UPDATE_VERB = Platform.OS === "ios" ? "Update" : "Download";

export function useAppUpdate() {
  const client = useApi();
  const { state } = useSession();
  const server = useServer();
  const latest = useQuery({
    queryKey: ["app-latest", server],
    queryFn: ({ signal }) => client.appLatest(signal),
    staleTime: 6 * 60 * 60_000,
    enabled: (Platform.OS === "android" || Platform.OS === "ios") && state.phase === "signedIn",
  });
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    void SecureStore.getItemAsync(DISMISSED).then((v) => setDismissed(v ? Number(v) : null)).catch(() => undefined);
  }, []);
  // On an iPhone only a release with an iPhone build counts.
  const newer: AppRelease | null = latest.data && latest.data.versionCode > installed.code
    && (Platform.OS !== "ios" || !!latest.data.ios) ? latest.data : null;
  const dismiss = useCallback(() => {
    if (!newer) return;
    setDismissed(newer.versionCode);
    void SecureStore.setItemAsync(DISMISSED, String(newer.versionCode)).catch(() => undefined);
  }, [newer]);
  /** Opens a fresh download link in the phone's browser (on an iPhone, SideStore or
   *  AltStore, and says which); false when there's nothing to open. */
  const download = useCallback(async (): Promise<string | boolean> => {
    if (Platform.OS === "ios") {
      const store = await iphoneStore();
      if (!store) return false;
      await Linking.openURL(store.url);
      return store.name;
    }
    const url = await client.appDownloadLink();
    // Only a download from the signed-in Plexbie itself, never another site or app.
    if (!url || new URL(url).origin !== new URL(server).origin) return false;
    await Linking.openURL(url);
    return true;
  }, [client, server]);
  return { newer, card: !!newer && dismissed !== newer.versionCode, dismiss, download };
}
