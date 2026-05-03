const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramNewTicketNotificationPayload {
  ticketId: string;
  subject: string;
  userName: string;
  userEmail: string;
  createdAt: Date;
  firstMessage: string;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

function getTelegramConfig():
  | { token: string; chatId: string }
  | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!token || !chatId) {
    return null;
  }

  return { token, chatId };
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("[telegram] notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is not configured.");
    return false;
  }

  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${config.token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true
      })
    }
  );

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(
      `[telegram] sendMessage failed: ${response.status} ${response.statusText} ${payload}`.trim()
    );
  }

  return true;
}

export async function notifyAdminNewSupportTicket(
  payload: TelegramNewTicketNotificationPayload
): Promise<boolean> {
  const adminUrl = `${resolveAppUrl().replace(/\/$/, "")}/admin/support/tickets/${payload.ticketId}`;
  const createdAt = payload.createdAt.toISOString().slice(0, 16).replace("T", " ");

  const text = [
    "Новый тикет в поддержке",
    "",
    `Тикет: #${payload.ticketId}`,
    `Тема: ${payload.subject}`,
    `Пользователь: ${payload.userName}`,
    `Email: ${payload.userEmail}`,
    `Дата: ${createdAt}`,
    "",
    "Сообщение:",
    payload.firstMessage,
    "",
    "Ответить в админ-панели:",
    adminUrl
  ].join("\n");

  return sendTelegramMessage(text);
}
