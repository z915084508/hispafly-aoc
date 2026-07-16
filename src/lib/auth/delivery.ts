import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type IdentityTokenType = "verify_email" | "reset_password";

function required(name: "SMTP_USER" | "SMTP_PASSWORD" | "AUTH_EMAIL_FROM" | "APP_BASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

export function buildIdentityEmail(input: { type: IdentityTokenType; token: string; baseUrl: string }) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const path = input.type === "verify_email" ? "/verify-email" : "/reset-password";
  const url = `${baseUrl}${path}?token=${encodeURIComponent(input.token)}`;
  const verifying = input.type === "verify_email";
  const title = verifying ? "Verify your Hispafly account" : "Reset your Hispafly password";
  const introduction = verifying
    ? "Welcome to Hispafly. Confirm your email address to activate your Pilot account."
    : "A password reset was requested for your Hispafly account.";
  const action = verifying ? "VERIFY EMAIL" : "RESET PASSWORD";
  const expiry = verifying ? "This link expires in 24 hours." : "This link expires in 30 minutes and can only be used once.";
  return {
    subject: title,
    text: `${introduction}\n\n${url}\n\n${expiry}\nIf you did not request this, you can ignore this email.`,
    html: `<div style="margin:0;background:#f3f6fa;padding:32px;font-family:Arial,sans-serif;color:#17263a"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dce3ec;border-radius:16px;padding:32px"><div style="font-size:12px;font-weight:800;letter-spacing:.16em;color:#0d5fa8">HISPAFLY IDENTITY</div><h1 style="font-size:28px;margin:16px 0">${title}</h1><p style="line-height:1.6">${introduction}</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#0d5fa8;color:#fff;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:8px">${action}</a></p><p style="font-size:13px;color:#64748b">${expiry}</p><p style="font-size:13px;color:#64748b">If you did not request this, you can ignore this email.</p></div></div>`,
    url,
  };
}

export async function deliverIdentityToken(input: { type: IdentityTokenType; email: string; token: string }) {
  if (process.env.NODE_ENV !== "production" && !process.env.SMTP_PASSWORD) {
    console.info(`[Identity email stub] ${input.type} for ${input.email}: ${input.token}`);
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? "465");
  const message = buildIdentityEmail({ type: input.type, token: input.token, baseUrl: required("APP_BASE_URL") });
  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: required("SMTP_USER"), pass: required("SMTP_PASSWORD").replace(/\s+/g, "") },
  };
  const transport = nodemailer.createTransport(options);
  await transport.sendMail({ from: required("AUTH_EMAIL_FROM"), to: input.email, subject: message.subject, text: message.text, html: message.html });
  return true;
}
