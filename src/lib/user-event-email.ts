import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";

interface UserEmailPayload {
  to: string | null | undefined;
  subject: string;
  text: string;
  html: string;
}

interface UserEmailResult {
  ok: boolean;
  providerMessageId: string | null;
}

async function sendUserEventEmail(payload: UserEmailPayload): Promise<UserEmailResult> {
  const to = payload.to?.trim();
  if (!to) {
    return { ok: false, providerMessageId: null };
  }

  const transporter = getSmtpBzTransporter();
  const from = getSmtpFromAddress();
  if (!transporter || !from) {
    return { ok: false, providerMessageId: null };
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });

  return {
    ok: true,
    providerMessageId: typeof info.messageId === "string" ? info.messageId : null
  };
}

function greetUser(name?: string | null) {
  return name?.trim() || "Здравствуйте";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTicketRow(ticket: {
  ticketTypeName: string;
  ticketCode: string;
  checkUrl: string;
  qrImageUrl: string;
}) {
  return (
    `<div style="margin:20px 0;padding:18px;border:1px solid #dfe7f3;border-radius:16px;background:#f8fbff;">` +
    `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#101828;">${escapeHtml(ticket.ticketTypeName)}</p>` +
    `<p style="margin:0 0 12px;font-size:13px;color:#475467;">Код билета: <strong>${escapeHtml(ticket.ticketCode)}</strong></p>` +
    `<img src="${ticket.qrImageUrl}" alt="QR code" width="220" height="220" style="display:block;width:220px;height:220px;border-radius:12px;border:1px solid #d0d5dd;background:#fff;" />` +
    `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#344054;word-break:break-all;">` +
    `<a href="${ticket.checkUrl}" style="color:#0f62fe;text-decoration:none;">${ticket.checkUrl}</a>` +
    `</p>` +
    `</div>`
  );
}

export async function sendReleaseDecisionEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  releaseTitle: string;
  approved: boolean;
  reason?: string | null;
}): Promise<boolean> {
  const releaseTitle = params.releaseTitle.trim() || "Ваш релиз";
  const greeting = greetUser(params.userName);

  if (params.approved) {
    return (
      await sendUserEventEmail({
        to: params.to,
        subject: `Релиз принят: ${releaseTitle}`,
        text:
          `${greeting}.\n\n` +
          `Ваш релиз «${releaseTitle}» принят.\n` +
          `Он успешно прошёл проверку и был подтверждён.\n\n` +
          `Откройте личный кабинет ICECREAMMUSIC, чтобы посмотреть актуальный статус.`,
        html:
          `<p>${greeting}.</p>` +
          `<p>Ваш релиз <strong>«${releaseTitle}»</strong> принят.</p>` +
          `<p>Он успешно прошёл проверку и был подтверждён.</p>` +
          `<p>Откройте личный кабинет ICECREAMMUSIC, чтобы посмотреть актуальный статус.</p>`
      })
    ).ok;
  }

  const reasonBlock = params.reason?.trim() ? `\n\nПричина: ${params.reason.trim()}` : "";
  const reasonHtml = params.reason?.trim() ? `<p><strong>Причина:</strong> ${params.reason.trim()}</p>` : "";

  return (
    await sendUserEventEmail({
      to: params.to,
      subject: `Релиз требует доработки: ${releaseTitle}`,
      text:
        `${greeting}.\n\n` +
        `Ваш релиз «${releaseTitle}» пока не принят и отправлен на доработку.` +
        reasonBlock +
        `\n\nОткройте личный кабинет ICECREAMMUSIC, внесите изменения и отправьте релиз повторно.`,
      html:
        `<p>${greeting}.</p>` +
        `<p>Ваш релиз <strong>«${releaseTitle}»</strong> пока не принят и отправлен на доработку.</p>` +
        reasonHtml +
        `<p>Откройте личный кабинет ICECREAMMUSIC, внесите изменения и отправьте релиз повторно.</p>`
    })
  ).ok;
}

export async function sendVerificationDecisionEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  approved: boolean;
  reason?: string | null;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);

  if (params.approved) {
    return (
      await sendUserEventEmail({
        to: params.to,
        subject: "Верификация подтверждена",
        text:
          `${greeting}.\n\n` +
          `Ваша верификация подтверждена.\n` +
          `Теперь вы можете продолжать работу в ICECREAMMUSIC без ограничений по этому этапу.`,
        html:
          `<p>${greeting}.</p>` +
          `<p>Ваша верификация подтверждена.</p>` +
          `<p>Теперь вы можете продолжать работу в ICECREAMMUSIC без ограничений по этому этапу.</p>`
      })
    ).ok;
  }

  const reasonBlock = params.reason?.trim() ? `\n\nПричина: ${params.reason.trim()}` : "";
  const reasonHtml = params.reason?.trim() ? `<p><strong>Причина:</strong> ${params.reason.trim()}</p>` : "";

  return (
    await sendUserEventEmail({
      to: params.to,
      subject: "Верификация отклонена",
      text:
        `${greeting}.\n\n` +
        `Ваша верификация пока не подтверждена.` +
        reasonBlock +
        `\n\nПроверьте данные в кабинете и отправьте верификацию повторно.`,
      html:
        `<p>${greeting}.</p>` +
        `<p>Ваша верификация пока не подтверждена.</p>` +
        reasonHtml +
        `<p>Проверьте данные в кабинете и отправьте верификацию повторно.</p>`
    })
  ).ok;
}

export async function sendDashboardEventEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  title: string;
  message: string;
  href?: string | null;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);
  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://www.icecreammusic.net").replace(/\/$/u, "");
  const href = params.href ? `${baseUrl}${params.href.startsWith("/") ? params.href : `/${params.href}`}` : baseUrl;
  const result = await sendUserEventEmail({
    to: params.to,
    subject: params.title,
    text: `${greeting}.\n\n${params.message}\n\nОткрыть: ${href}`,
    html:
      `<p>${escapeHtml(greeting)}.</p>` +
      `<p>${escapeHtml(params.message)}</p>` +
      `<p><a href="${escapeHtml(href)}">Открыть ICECREAMMUSIC</a></p>`
  });
  return result.ok;
}

export async function sendAiTokensCreditedEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  packageName: string;
  totalTokens: number;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);
  const packageName = params.packageName.trim() || "AI-токены";

  return (
    await sendUserEventEmail({
      to: params.to,
      subject: `AI-токены начислены: ${packageName}`,
      text:
        `${greeting}.\n\n` +
        `На ваш баланс начислены AI-токены.\n` +
        `Пакет: ${packageName}\n` +
        `Количество: ${params.totalTokens} AI-токенов\n\n` +
        `Токены уже доступны в AI Studio.`,
      html:
        `<p>${greeting}.</p>` +
        `<p>На ваш баланс начислены AI-токены.</p>` +
        `<p><strong>Пакет:</strong> ${packageName}<br /><strong>Количество:</strong> ${params.totalTokens} AI-токенов</p>` +
        `<p>Токены уже доступны в AI Studio.</p>`
    })
  ).ok;
}

export async function sendAiTokensPendingEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  packageName: string;
  totalTokens: number;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);
  const packageName = params.packageName.trim() || "AI-токены";

  return (
    await sendUserEventEmail({
      to: params.to,
      subject: `Оплата получена: ${packageName}`,
      text:
        `${greeting}.\n\n` +
        `Оплата за пакет AI-токенов подтверждена.\n` +
        `Пакет: ${packageName}\n` +
        `Количество: ${params.totalTokens} AI-токенов\n\n` +
        `Токены пока находятся в ожидании активации AI Studio и будут начислены автоматически.`,
      html:
        `<p>${greeting}.</p>` +
        `<p>Оплата за пакет AI-токенов подтверждена.</p>` +
        `<p><strong>Пакет:</strong> ${packageName}<br /><strong>Количество:</strong> ${params.totalTokens} AI-токенов</p>` +
        `<p>Токены пока находятся в ожидании активации AI Studio и будут начислены автоматически.</p>`
    })
  ).ok;
}

export async function sendEventTicketsPaidEmail(params: {
  to: string | null | undefined;
  buyerName?: string | null;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  venueAddress: string;
  orderNumber: string;
  paymentStatusLabel: string;
  tickets: Array<{
    ticketTypeName: string;
    ticketCode: string;
    checkUrl: string;
    qrImageUrl: string;
  }>;
}): Promise<UserEmailResult> {
  const greeting = greetUser(params.buyerName);
  const venueLine = [params.venueName.trim(), params.venueAddress.trim()].filter(Boolean).join(", ");
  const ticketsText = params.tickets
    .map(
      (ticket) =>
        `- ${ticket.ticketTypeName}\n  Код: ${ticket.ticketCode}\n  Ссылка: ${ticket.checkUrl}`
    )
    .join("\n\n");

  return sendUserEventEmail({
    to: params.to,
    subject: `Ваши билеты ICECREAMMUSIC: ${params.eventTitle}`,
    text:
      `${greeting}.\n\n` +
      `Оплата подтверждена. Ваши билеты готовы.\n\n` +
      `Мероприятие: ${params.eventTitle}\n` +
      `Дата: ${params.eventDate}\n` +
      `Место: ${venueLine || "Будет объявлено"}\n` +
      `Номер заказа: ${params.orderNumber}\n` +
      `Статус оплаты: ${params.paymentStatusLabel}\n\n` +
      `${ticketsText}\n\n` +
      `Покажите QR-код из письма или откройте ссылку билета на входе.`,
    html:
      `<p>${greeting}.</p>` +
      `<p>Оплата подтверждена. Ваши билеты готовы.</p>` +
      `<p>` +
      `<strong>Мероприятие:</strong> ${escapeHtml(params.eventTitle)}<br />` +
      `<strong>Дата:</strong> ${escapeHtml(params.eventDate)}<br />` +
      `<strong>Место:</strong> ${escapeHtml(venueLine || "Будет объявлено")}<br />` +
      `<strong>Номер заказа:</strong> ${escapeHtml(params.orderNumber)}<br />` +
      `<strong>Статус оплаты:</strong> ${escapeHtml(params.paymentStatusLabel)}` +
      `</p>` +
      params.tickets.map(renderTicketRow).join("") +
      `<p>Покажите QR-код из письма или откройте ссылку билета на входе.</p>`
  });
}
