// Small text helpers more than one screen uses.

/** Catches an obvious typo; not a full address check. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "14 Mar" in the phone's own order; "" when there's no date. */
export const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
