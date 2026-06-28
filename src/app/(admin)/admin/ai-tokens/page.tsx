import { AdminAiTokensClient } from "@/components/admin/admin-ai-tokens-client";
import { PageHeader } from "@/components/layout/page-header";
import { getAiStudioSystemStatus, listPreparingAiTokenOrders } from "@/lib/ai-studio-activation";
import { listAdminUsers } from "@/lib/admin-user-service";
import { prisma } from "@/lib/prisma";

export default async function AdminAiTokensPage() {
  const [initial, aiStudioStatus, preparingOrders] = await Promise.all([
    listAdminUsers(prisma, {
      q: undefined,
      subscription: undefined,
      status: undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      perPage: 20
    }),
    getAiStudioSystemStatus(prisma),
    listPreparingAiTokenOrders(prisma)
  ]);

  return (
    <div className="pb-10">
      <PageHeader
        title="AI-токены пользователей"
        description="Поиск пользователей, управление балансом AI-токенов и просмотр истории операций."
      />

      <AdminAiTokensClient
        initialData={initial}
        initialAiStudioStatus={aiStudioStatus}
        initialPreparingOrdersCount={preparingOrders.length}
      />
    </div>
  );
}
