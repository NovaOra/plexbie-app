import { useState } from "react";
import { Platform } from "react-native";
import { useToast } from "../../ui/Toast";

/** Download (or Update) with its busy state and the toast that says what happened.
 *  `keepsSignedIn` adds "It keeps you signed in." where a download was started. */
export function useDownloadUpdate(download: () => Promise<string | boolean>, { keepsSignedIn = false } = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const signedIn = keepsSignedIn ? " It keeps you signed in." : "";
  const get = async () => {
    setBusy(true);
    try {
      const opened = await download();
      toast(typeof opened === "string" ? { text: `Opening ${opened}`, detail: `Plexbie’s update is waiting there.${signedIn}` }
        : opened ? { text: "Downloading in your browser", detail: `Open the file when it’s done to install.${signedIn}` }
        : Platform.OS === "ios" ? { text: "Update from SideStore", detail: "Open SideStore (or AltStore) and update Plexbie there." }
        : { text: "Nothing to download here", detail: "The sample household has no app to download." });
    } catch {
      toast({ text: "Couldn’t start the download", detail: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };
  return { busy, get };
}
