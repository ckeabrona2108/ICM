/**
 * Money of one report quarter and what was already taken from it by payout requests.
 * Shared by the payout request route and the payout wizard (no server imports here).
 *
 * A quarter can be paid out in several requests: an artist may withdraw part of it, and a
 * supplement or an admin credit may add money to a quarter that was already paid. Only one
 * request per quarter may be open (requested or processing) at a time.
 *
 * One request may also cover several quarters at once (`periods`): the total has to reach the
 * minimum payout, not each quarter, so a quarter with 100 ₽ left is withdrawn together with the
 * others. The amount is taken from the oldest quarter first.
 */

export interface PayoutPeriodShare {
  quarter: number;
  year: number;
  amount: number;
  reportId?: string | null;
}

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
  payouts: ReadonlyArray<{
    quarter: number | null;
    year: number | null;
    amount: number;
    status: string;
    confirmed?: boolean | null;
    /** Quarters a multi-quarter request takes its money from; the request's own quarter otherwise. */
    periods?: ReadonlyArray<PayoutPeriodShare> | null;
  }>
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
    const open = payout.status === "REQUESTED" || payout.status === "PROCESSING";
    const paid = payout.status === "PAID" || payout.confirmed === true;
    if (!open && !paid) continue;
    const shares = payout.periods?.length
      ? payout.periods.map((share) => ({ key: quarterKey(share.quarter, share.year), amount: share.amount }))
      : [{ key: quarterKey(payout.quarter, payout.year), amount: payout.amount }];
    for (const share of shares) {
      if (!share.key) continue;
      const state = stateFor(share.key);
      state.taken += Math.abs(Number(share.amount) || 0);
      if (open) state.hasOpenRequest = true;
    }
  }
  for (const state of states.values()) {
    state.agreed = round(state.agreed);
    state.taken = round(state.taken);
    state.remaining = Math.max(0, round(state.agreed - state.taken));
  }
  return states;
}

const quarterOrder = (item: { quarter: number; year: number }) => item.year * 10 + item.quarter;

/**
 * Splits the requested amount over the chosen quarters, oldest first; quarters the amount does not
 * reach are left out. Returns null when the quarters together hold less than the amount.
 */
export function allocatePayoutAcrossQuarters(
  amount: number,
  quarters: ReadonlyArray<{ quarter: number; year: number; remaining: number; reportId?: string | null }>
): PayoutPeriodShare[] | null {
  let left = round(amount);
  const shares: PayoutPeriodShare[] = [];
  for (const item of [...quarters].sort((a, b) => quarterOrder(a) - quarterOrder(b))) {
    if (left <= 0) break;
    const take = round(Math.min(left, Math.max(0, item.remaining)));
    if (take <= 0) continue;
    shares.push({ quarter: item.quarter, year: item.year, amount: take, reportId: item.reportId ?? null });
    left = round(left - take);
  }
  return left > 0.004 ? null : shares;
}

/** "2 квартал 2026", "2 и 3 квартал 2026", "4 квартал 2025, 1 и 2 квартал 2026". */
export function formatPayoutPeriods(periods: ReadonlyArray<{ quarter: number; year: number }>): string {
  const byYear = new Map<number, number[]>();
  for (const item of [...periods].sort((a, b) => quarterOrder(a) - quarterOrder(b))) {
    const list = byYear.get(item.year) ?? [];
    if (!list.includes(item.quarter)) list.push(item.quarter);
    byYear.set(item.year, list);
  }
  return Array.from(byYear.entries())
    .map(([year, quarters]) => {
      const head = quarters.length > 1 ? `${quarters.slice(0, -1).join(", ")} и ${quarters[quarters.length - 1]}` : String(quarters[0]);
      return `${head} квартал ${year}`;
    })
    .join(", ");
}
