import nodemailer, { type Transporter } from "nodemailer";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

let cachedSignature: string | null = null;
let cachedTransporter: Transporter | null = null;

function readSmtpConfig(): SmtpConfig | null {
  const host =
    process.env.SMTP_BZ_HOST?.trim() ||
    process.env.SMTP_HOST?.trim() ||
    "smtp.bz";
  const portRaw = process.env.SMTP_BZ_PORT?.trim() || process.env.SMTP_PORT?.trim() || "465";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;

  const secureRaw = process.env.SMTP_BZ_SECURE?.trim() || process.env.SMTP_SECURE?.trim();
  const secure =
    secureRaw == null
      ? port === 465
      : ["1", "true", "yes", "on"].includes(secureRaw.toLowerCase());

  const user = process.env.SMTP_BZ_USER?.trim() || process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_BZ_PASSWORD?.trim() || process.env.SMTP_PASS?.trim() || "";
  if (!user || !pass) return null;

  return { host, port, secure, user, pass };
}

export function getSmtpBzTransporter(): Transporter | null {
  const config = readSmtpConfig();
  if (!config) return null;

  const signature = `${config.host}:${config.port}:${config.secure ? "secure" : "plain"}:${config.user}:${config.pass}`;
  if (!cachedTransporter || cachedSignature !== signature) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
    cachedSignature = signature;
  }

  return cachedTransporter;
}

export function getSmtpFromAddress(): string | null {
  const configuredFromEmail =
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim();
  const smtpConfig = readSmtpConfig();
  const fromEmail = configuredFromEmail || smtpConfig?.user || null;
  if (!fromEmail) return null;

  const fromName =
    process.env.SMTP_FROM_NAME?.trim() ||
    process.env.RESEND_FROM_NAME?.trim();
  if (!fromName) return fromEmail;

  return `${fromName} <${fromEmail}>`;
}
