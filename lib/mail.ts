// lib/mail.ts
//
// Minimal mail helper using Resend API if RESEND_API_KEY is set.
// Falls back to console logging in dev.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.MAIL_FROM || 'no-reply@replyorrefund.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

type SendParams = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail({ to, subject, text }: SendParams) {
  if (!to || !subject || !text) return;
  if (!RESEND_API_KEY) {
    console.log('[mail] RESEND_API_KEY not set. Would send:', { to, subject, text });
    return;
  }
  const body = {
    from: FROM_EMAIL,
    to,
    subject,
    text,
  };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    console.error('[mail] send failed', res.status, msg);
  }
}

export async function sendVerificationEmail(handle: string, email: string, code: string) {
  const link = `${SITE_URL}/creator/${encodeURIComponent(handle)}?code=${encodeURIComponent(code)}`;
  const text =
    `Verify your Reply or Refund creator account @${handle}\n\n` +
    `Code: ${code}\n` +
    `Or click: ${link}\n\n` +
    `If you did not request this, ignore this email.`;
  await sendEmail({ to: email, subject: `Verify @${handle} on Reply or Refund`, text });
}

export async function sendNewThreadEmail(params: { creator: string; email: string; threadId: string; amount: number }) {
  const link = `${SITE_URL}/c/${encodeURIComponent(params.threadId)}`;
  const text =
    `New paid DM for @${params.creator}\n\n` +
    `Amount: €${params.amount}\n` +
    `Open chat: ${link}\n\n` +
    `Reply before the deadline to release escrow.`;
  await sendEmail({ to: params.email, subject: `New paid DM for @${params.creator}`, text });
}
