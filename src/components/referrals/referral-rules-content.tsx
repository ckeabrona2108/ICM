import { REFERRAL_RULES } from "@/lib/referral-rules";

/** The rules text, shared by the «Пригласить друга» page and /referral-rules. */
export function ReferralRulesContent() {
  return (
    <div className="space-y-7">
      {REFERRAL_RULES.map((section, index) => (
        <section key={section.title}>
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.06em] text-white/85">
            {index + 1}. {section.title}
          </h3>
          <ol className="mt-2.5 space-y-2">
            {section.clauses.map((clause) => (
              <li key={clause.n} className="grid grid-cols-[2.5rem_1fr] gap-x-2 text-[13.5px] leading-[1.6] text-white/70">
                <span className="tabular-nums text-white/35">{clause.n}</span>
                <div className="min-w-0">
                  <p>{clause.text}</p>
                  {clause.items ? (
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-white/30">
                      {clause.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
