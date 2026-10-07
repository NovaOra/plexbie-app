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

/** A native failure never reaches the caller; a development build says what it was. */
const failed = (what: string) => (e: unknown) => { if (__DEV__) console.warn(`Live progress: ${what} failed`, e); };

export const liveSupported = native !== null;
export const canPromote = (): boolean => { try { return native?.canPromote() ?? false; } catch (e) { failed("canPromote")(e); return false; } };
export const showLive = (id: string, slot: number | null, title: string, text: string, stage: string, percent: number | null, timeoutMs: number,
  promote = true) =>
  native?.show(id, slot, title, text, stage, percent, timeoutMs, promote).catch(failed("show")) ?? Promise.resolve();
export const endLive = (id: string) => native?.end(id).catch(failed("end")) ?? Promise.resolve();
export const endAllLive = () => native?.endAll().catch(failed("endAll")) ?? Promise.resolve();
