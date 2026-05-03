import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { listAdminUsers } from "@/lib/admin-user-service";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const initial = await listAdminUsers(prisma, {
    q: undefined,
    subscription: undefined,
    status: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    perPage: 20
  });

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
        Пользователи
      </h1>
      <p className="mt-2 max-w-3xl text-[14px] text-white/65">
        Управление пользователями: просмотр релизов, пополнение баланса, добавление отчетов и
        изменение подписки.
      </p>

      <AdminUsersClient initialData={initial} />
    </div>
  );
}
