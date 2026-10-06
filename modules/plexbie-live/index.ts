// Live progress notifications (Android): see android/.../PlexbieLiveModule.kt.
// On iPhone there's no native side; every call quietly does nothing.
import { requireOptionalNativeModule } from "expo";

type Native = {
  canPromote(): boolean;
  show(id: string, slot: number | null, title: string, text: string, stage: string, percent: number | null, timeoutMs: number, promote: boolean): Promise<void>;
  end(id: string): Promise<void>;
  endAll(): Promise<void>;
};

const native = requireOptionalNativeModule<Native>("PlexbieLive");

export const liveSupported = native !== null;
export const canPromote = (): boolean => { try { return native?.canPromote() ?? false; } catch { return false; } };
export const showLive = (id: string, slot: number | null, title: string, text: string, stage: string, percent: number | null, timeoutMs: number,
  promote = true) =>
  native?.show(id, slot, title, text, stage, percent, timeoutMs, promote).catch(() => undefined) ?? Promise.resolve();
export const endLive = (id: string) => native?.end(id).catch(() => undefined) ?? Promise.resolve();
export const endAllLive = () => native?.endAll().catch(() => undefined) ?? Promise.resolve();
