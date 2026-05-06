import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPaymentStatusDescriptor } from "@/lib/release-status-ui";

export function PaymentStatusBadge({ paid }: { paid: boolean }) {
  const descriptor = getPaymentStatusDescriptor(paid);

  return (
    <Badge variant={descriptor.variant} className={cn(descriptor.className)}>
      {descriptor.label}
    </Badge>
  );
}
