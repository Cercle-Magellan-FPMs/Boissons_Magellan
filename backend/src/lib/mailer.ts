import nodemailer from "nodemailer";

type MailPayload = {
  to: string;
  subject: string;
  text: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

export function resetMailTransporter() {
  cachedTransporter = null;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`MAIL_NOT_CONFIGURED:${name}`);
  }
  return value;
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASS");

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return cachedTransporter;
}

export async function sendMail(payload: MailPayload) {
  const from = getRequiredEnv("SMTP_FROM");
  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  });
}
