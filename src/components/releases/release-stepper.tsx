import { cn } from "@/lib/utils";

const steps = [
  "Basic Info",
  "Files Upload",
  "Metadata",
  "Platforms",
  "Review & Submit"
];

export function ReleaseStepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-3 md:grid-cols-5">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const active = currentStep === stepNumber;
        const completed = currentStep > stepNumber;

        return (
          <li
            key={step}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm",
              active && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
              completed && "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
              !active && !completed && "border-white/10 bg-black/20 text-muted-foreground"
            )}
          >
            <span className="mr-2 font-semibold">{stepNumber}.</span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}
