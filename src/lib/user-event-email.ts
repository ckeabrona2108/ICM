import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";

interface UserEmailPayload {
  to: string | null | undefined;
  subject: string;
  text: string;
  html: string;
}

async function sendUserEventEmail(payload: UserEmailPayload): Promise<boolean> {
  const to = payload.to?.trim();
  if (!to) return false;

  const transporter = getSmtpBzTransporter();
  const from = getSmtpFromAddress();
  if (!transporter || !from) return false;

  await transporter.sendMail({
    from,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });

  return true;
}

function greetUser(name?: string | null) {
  return name?.trim() || "Здравствуйте";
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
    return sendUserEventEmail({
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
    });
  }

  const reasonBlock = params.reason?.trim()
    ? `\n\nПричина: ${params.reason.trim()}`
    : "";
  const reasonHtml = params.reason?.trim()
    ? `<p><strong>Причина:</strong> ${params.reason.trim()}</p>`
    : "";

  return sendUserEventEmail({
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
  });
}

export async function sendVerificationDecisionEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  approved: boolean;
  reason?: string | null;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);

  if (params.approved) {
    return sendUserEventEmail({
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
    });
  }

  const reasonBlock = params.reason?.trim()
    ? `\n\nПричина: ${params.reason.trim()}`
    : "";
  const reasonHtml = params.reason?.trim()
    ? `<p><strong>Причина:</strong> ${params.reason.trim()}</p>`
    : "";

  return sendUserEventEmail({
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
  });
}

export async function sendAiTokensCreditedEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  packageName: string;
  totalTokens: number;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);
  const packageName = params.packageName.trim() || "AI-токены";

  return sendUserEventEmail({
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
  });
}

export async function sendAiTokensPendingEmail(params: {
  to: string | null | undefined;
  userName?: string | null;
  packageName: string;
  totalTokens: number;
}): Promise<boolean> {
  const greeting = greetUser(params.userName);
  const packageName = params.packageName.trim() || "AI-токены";

  return sendUserEventEmail({
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
  });
}
