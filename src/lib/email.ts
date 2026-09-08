import nodemailer from 'nodemailer';

/**
 * lib/email.ts — Transactional email service powered by Nodemailer.
 *
 * Reads SMTP credentials dynamically from process.env:
 * - SMTP_HOST: e.g. smtp.gmail.com
 * - SMTP_PORT: e.g. 465 or 587
 * - SMTP_SECURE: true for port 465 (SSL), false for 587 (STARTTLS)
 * - SMTP_USER: user email
 * - SMTP_PASSWORD: app password
 * - EMAIL_FROM: sender address
 */

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  html?: string,
): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM || user || '"Authentication Service" <noreply@example.com>';
  const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;

  const isConfigured = Boolean(
    host &&
    user &&
    pass &&
    !user.includes('your-email') &&
    !pass.includes('your-')
  );

  if (isConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: {
          user,
          pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      await transporter.sendMail({
        from,
        to,
        subject,
        text: body,
        html: html || `<p>${body.replace(/\n/g, '<br/>')}</p>`,
      });

      console.log(`[EMAIL-SENT] Successfully delivered email to: ${to} | Subject: ${subject}`);
      return;
    } catch (error) {
      console.error('[EMAIL-ERROR] SMTP delivery failed:', error);
      // Fallback to console logger so registration flow never crashes or hangs
      console.log(`[EMAIL-FALLBACK] To: ${to} | Subject: ${subject} | Body: ${body}`);
      return;
    }
  }

  // Development logger fallback when SMTP credentials are not active
  console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);
}
