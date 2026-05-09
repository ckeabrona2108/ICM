import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPaymentStatusDescriptor } from "@/lib/release-status-ui";

export function PaymentStatusBadge({
  paid,
  label,
  kind
}: {
  paid: boolean;
  label?: string;
  kind?: "paid" | "subscription" | "unpaid";
}) {
  const descriptor = getPaymentStatusDescriptor({ paid, label, kind });

  return (
    <Badge variant={descriptor.variant} className={cn(descriptor.className)}>
      {descriptor.label}
    </Badge>
  );
}
