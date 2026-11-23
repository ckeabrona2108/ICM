import { applyReferralDiscount } from "@/lib/referral-shared";

/**
 * "По приглашению: −20%" for a friend who has not paid yet. The discount itself is applied to the
 * payment on the server; this only tells the friend before they press pay.
 */
export function ReferralDiscountNotice({ percent, fullRub, what }: { percent: number; fullRub?: number | null; what: string }) {
  if (!percent) return null;
  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-300/[0.10] px-3.5 py-2.5 text-[13px] leading-5 text-amber-100">
      <span className="font-semibold text-amber-200">Скидка {percent}% по приглашению</span> на {what}
      {fullRub ? (
        <>
          : <span className="text-white/45 line-through">{fullRub} ₽</span>{" "}
          <span className="font-semibold text-white">{applyReferralDiscount(fullRub)} ₽</span>
        </>
      ) : null}
      . Применится сама при оплате.
    </div>
  );
}

/** The friend's first-payment prices on the tariffs page: one tile per tariff, old price crossed out. */
export function ReferralTariffDiscountNotice({
  percent,
  tariffs
}: {
  percent: number;
  tariffs: Array<{ title: string; amountRub: number }>;
}) {
  if (!percent || tariffs.length === 0) return null;
  return (
    <div className="rounded-[20px] border border-amber-300/40 bg-amber-300/[0.08] p-4">
      <p className="text-[14px] font-semibold text-amber-200">Скидка {percent}% по приглашению на первую оплату</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {tariffs.map((tariff) => (
          <div key={tariff.title} className="rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 py-2.5">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-white/60">{tariff.title}</p>
            <p className="mt-0.5">
              <span className="text-[13px] text-white/40 line-through">{tariff.amountRub} ₽</span>{" "}
              <span className="text-[18px] font-bold text-white">{applyReferralDiscount(tariff.amountRub)} ₽</span>
              <span className="text-[12px] text-white/50"> / мес</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[12px] text-white/50">Применится сама при оплате — промокод не нужен.</p>
    </div>
  );
}
