import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AiStudioPage as AiStudioScreen } from "@/components/ai/ai-studio-page";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { authOptions } from "@/lib/auth";
import { confirmYooKassaOrderAfterReturn } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import {
  getAiStudioPageData,
  isAiStudioWorkspaceTab,
  type AiStudioWorkspaceTab
} from "../page-data";

export default async function AiStudioTabPage({
  params,
  searchParams
}: {
  params: Promise<{ tab: string }>;
  searchParams?: Promise<{ chat?: string; pay_order?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { tab } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  if (!isAiStudioWorkspaceTab(tab)) {
    notFound();
  }

  const payOrderId = resolvedSearchParams.pay_order?.trim();
  const paymentResult = payOrderId
    ? await confirmYooKassaOrderAfterReturn({
        prisma,
        userId: session.user.id,
        orderId: payOrderId
      }).catch((error) => {
        console.error("[ai-studio:return] failed to confirm payment", error);
        return null;
      })
    : null;

  const data = await getAiStudioPageData(session.user.id, tab as AiStudioWorkspaceTab, resolvedSearchParams.chat);
  if (!data) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <AiStudioScreen
        activeTab={tab as AiStudioWorkspaceTab}
        userName={data.userName}
        aiStudioStatus={data.aiStudioStatus}
        aiTokenBalance={data.aiTokenBalance}
        pendingAiTokenBalance={data.pendingAiTokenBalance}
        royaltyBalance={data.royaltyBalance}
        entitlements={data.entitlements}
        initialModelCatalog={data.initialModelCatalog}
        chatThreads={data.chatThreads}
        activeChatThreadId={data.activeChatThreadId}
        activeChatThread={data.activeChatThread}
        history={data.history}
        uploads={data.uploads}
        notifications={data.notifications}
        paymentStatus={
          paymentResult?.status === "preparing"
            ? "preparing"
            : paymentResult?.applied
              ? "success"
              : paymentResult && paymentResult.status !== "not_found"
                ? paymentResult.status
                : null
        }
        paymentSummary={paymentResult?.paymentSummary ?? null}
      />
    </DashboardShell>
  );
}
