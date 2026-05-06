import type { ContractSignatureStatus } from "@/lib/contract-verification-shared";

export function getVerificationStatusMeta(status: ContractSignatureStatus) {
  if (status === "approved") {
    return {
      label: "Верифицирован",
      tooltip: "Вы можете выпускать релизы.",
      className: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
    };
  }
  if (status === "pending") {
    return {
      label: "На проверке",
      tooltip: "Договор подписан и ожидает проверки администратором.",
      className: "border-amber-300/30 bg-amber-500/12 text-amber-100"
    };
  }
  if (status === "rejected") {
    return {
      label: "Верификация отклонена",
      tooltip: "Пройдите верификацию заново.",
      className: "border-rose-400/30 bg-rose-500/12 text-rose-100"
    };
  }
  if (status === "invalid_signature") {
    return {
      label: "Не верифицирован",
      tooltip: "После переноса данных подпись не найдена. Подпишите договор заново.",
      className: "border-rose-400/25 bg-rose-500/10 text-rose-100"
    };
  }
  return {
    label: "Не верифицирован",
    tooltip: "Подпишите договор, чтобы выпускать релизы.",
    className: "border-white/15 bg-white/5 text-white/70"
  };
}
