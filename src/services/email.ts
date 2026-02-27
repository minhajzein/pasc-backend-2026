import nodemailer from "nodemailer";
import { env } from "../config/env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const { host, port, secure, user, pass } = env.smtp;
    if (!user || !pass) {
      throw new Error("SMTP_USER and SMTP_PASS must be set to send OTP emails");
    }
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // Avoid "self signed certificate" errors with some providers
      tls: { rejectUnauthorized: env.nodeEnv !== "development" },
    });
  }
  return transporter;
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transport = getTransporter();
  const from = env.smtp.from;
  await transport.sendMail({
    from: `PASFIESTA <${from}>`,
    to,
    subject: "Your PASFIESTA team registration OTP",
    text: `Your verification code for PASFIESTA team registration is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <p>Your verification code for PASFIESTA team registration is:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
}
