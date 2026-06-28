import { formatAiTokenAmount } from "@/lib/ai-studio";
import { formatRubCurrency } from "@/lib/currency-format";

export function ProfileBalanceCards({
  royaltyBalance,
  aiTokenBalance,
  monthlyBonusTokens
}: {
  royaltyBalance: number;
  aiTokenBalance: number;
  monthlyBonusTokens: number;
}) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <BalanceCard
        label="Роялти"
        value={formatRubCurrency(royaltyBalance)}
        hint="Доход от дистрибуции и выплат"
      />
      <BalanceCard
        label="AI-токены"
        value={formatAiTokenAmount(aiTokenBalance)}
        hint="Отдельный баланс для генераций"
      />
      <BalanceCard
        label="Бонус в месяц"
        value={formatAiTokenAmount(monthlyBonusTokens)}
        hint="Начисляется по активной подписке"
      />
    </div>
  );
}

function BalanceCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#13151d]/92 p-4 shadow-[0_10px_30px_-24px_rgba(11,14,24,0.9)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/42">{label}</p>
      <p className="mt-2 text-[26px] font-semibold text-white">{value}</p>
      <p className="mt-1 text-[13px] text-white/58">{hint}</p>
    </div>
  );
}
