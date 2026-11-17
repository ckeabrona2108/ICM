/**
 * Money of one report quarter and what was already taken from it by payout requests.
 * Shared by the payout request route and the payout wizard (no server imports here).
 *
 * A quarter can be paid out in several requests: an artist may withdraw part of it, and a
 * supplement or an admin credit may add money to a quarter that was already paid. Only one
 * request per quarter may be open (requested or processing) at a time.
 */

export interface QuarterPayoutState {
  agreed: number;
  taken: number;
  remaining: number;
  hasOpenRequest: boolean;
}

export function quarterKey(quarter: number | null | undefined, year: number | null | undefined): string | null {
  return quarter && year ? `${year}-${quarter}` : null;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function computeQuarterPayoutStates(
  reports: ReadonlyArray<{ quarter: number | null; year: number | null; amount: number; agreed: boolean }>,
  payouts: ReadonlyArray<{ quarter: number | null; year: number | null; amount: number; status: string; confirmed?: boolean | null }>
): Map<string, QuarterPayoutState> {
  const states = new Map<string, QuarterPayoutState>();
  const stateFor = (key: string) => {
    let state = states.get(key);
    if (!state) {
      state = { agreed: 0, taken: 0, remaining: 0, hasOpenRequest: false };
      states.set(key, state);
    }
    return state;
  };
  for (const report of reports) {
    const key = quarterKey(report.quarter, report.year);
    if (!key || !report.agreed) continue;
    stateFor(key).agreed += Number(report.amount) || 0;
  }
  for (const payout of payouts) {
    const key = quarterKey(payout.quarter, payout.year);
    if (!key) continue;
    const open = payout.status === "REQUESTED" || payout.status === "PROCESSING";
    const paid = payout.status === "PAID" || payout.confirmed === true;
    if (!open && !paid) continue;
    const state = stateFor(key);
    state.taken += Math.abs(Number(payout.amount) || 0);
    if (open) state.hasOpenRequest = true;
  }
  for (const state of states.values()) {
    state.agreed = round(state.agreed);
    state.taken = round(state.taken);
    state.remaining = Math.max(0, round(state.agreed - state.taken));
  }
  return states;
}
