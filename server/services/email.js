const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const FROM = process.env.FROM_EMAIL || 'SunoBro <orders@sunobro.com>';
const SITE = 'https://www.sunobro.com';
const LOGO = `${SITE}/brand/logo-mark-192.png`;

let resendClient = null;
const getResend = () => {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
};

let smtpTransport = null;
const getSmtp = () => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!smtpTransport) {
    const port = Number(process.env.SMTP_PORT || 587);
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return smtpTransport;
};

const mailConfigured = () => Boolean(getSmtp() || process.env.RESEND_API_KEY);

const deliver = async ({ to, subject, html, text }) => {
  const smtp = getSmtp();
  if (smtp) {
    const from = process.env.SMTP_FROM || `SunoBro <${process.env.SMTP_USER}>`;
    await smtp.sendMail({
      from, to, subject, html, text,
    });
    return;
  }

  const resend = getResend();
  if (!resend) return;
  const result = await resend.emails.send({
    from: FROM, to, subject, html,
  });
  if (result && result.error) {
    const error = new Error(result.error.message || 'Email was rejected');
    error.code = 'MAIL_REJECTED';
    throw error;
  }
};

const money = (n, cur = 'INR') => {
  const symbol = cur === 'INR' ? '₹' : '$';
  const amount = Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  return `${symbol}${amount}`;
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const button = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px">
  <tr>
    <td style="background:#c9d2ff;">
      <a href="${esc(href)}"
        style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;
        font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
        color:#1c2140;text-decoration:none;">
        ${esc(label)}
      </a>
    </td>
  </tr>
</table>`;

const frame = ({
  preheader, eyebrow, title, intro, bodyHtml, ctaHref, ctaLabel,
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#101218;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101218;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#171a22;border:1px solid #2c3140;">
          <tr>
            <td style="height:4px;background:#c9d2ff;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 28px 28px;font-family:Arial,Helvetica,sans-serif;color:#eceef6;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="${LOGO}" width="40" height="40" alt="SunoBro"
                      style="display:block;width:40px;height:40px;border:0;border-radius:10px;outline:none;" />
                  </td>
                  <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;
                    font-size:14px;letter-spacing:0.22em;font-weight:700;color:#c9d2ff;">
                    SUNOBRO
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9aa0b5;">
                ${esc(eyebrow)}
              </p>
              <h1 style="margin:0 0 14px;font-size:32px;line-height:1.15;font-weight:700;color:#ffffff;">
                ${esc(title)}
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#c5cad8;">
                ${esc(intro)}
              </p>
              ${bodyHtml || ''}
              ${ctaHref ? button(ctaHref, ctaLabel) : ''}
              <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #2c3140;
                font-size:12px;line-height:1.7;color:#7d8498;">
                240+ GSM · Print on demand · Ships across India<br>
                <a href="${SITE}" style="color:#c9d2ff;text-decoration:none;">www.sunobro.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const sendOrderConfirmation = async ({ to, order }) => {
  if (!mailConfigured()) {
    logger.warn('Email transport not configured — skipping order confirmation email');
    return;
  }

  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #2c3140;font-size:14px;color:#eceef6;">
        ${esc(item.name)}<br>
        <span style="color:#9aa0b5;font-size:12px">${esc(item.size)} / ${esc(item.color)}</span>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #2c3140;text-align:center;color:#c5cad8;">
        ${esc(item.qty)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #2c3140;text-align:right;color:#eceef6;">
        ${esc(money(item.price * item.qty, order.currency))}
      </td>
    </tr>`).join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="padding:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9aa0b5;">Item</td>
        <td style="padding:0 8px 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9aa0b5;text-align:center;">Qty</td>
        <td style="padding:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9aa0b5;text-align:right;">Subtotal</td>
      </tr>
      ${itemRows}
      <tr>
        <td colspan="2" style="padding-top:16px;font-size:16px;font-weight:700;color:#ffffff;">Total</td>
        <td style="padding-top:16px;text-align:right;font-size:16px;font-weight:700;color:#c9d2ff;">
          ${esc(money(order.total, order.currency))}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9aa0b5;">
      Shipping to
    </p>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#eceef6;">
      ${esc(order.shippingFirstName)} ${esc(order.shippingLastName)}<br>
      ${esc(order.shippingStreet)}<br>
      ${esc(order.shippingCity)}, ${esc(order.shippingPostalCode)}<br>
      ${esc(order.shippingCountry)}
    </p>`;

  const html = frame({
    preheader: `Order ${order.reference} is confirmed.`,
    eyebrow: 'Order',
    title: 'Order confirmed.',
    intro: `Reference ${order.reference}. We'll write again when it ships.`,
    bodyHtml,
    ctaHref: `${SITE}/account`,
    ctaLabel: 'View your orders',
  });

  try {
    await deliver({ to, subject: `Order confirmed — ${order.reference}`, html });
  } catch (err) {
    logger.error(err, 'Failed to send order confirmation email');
  }
};

const sendWelcome = async ({ to, name }) => {
  if (!mailConfigured()) {
    logger.warn('Email transport not configured — skipping welcome email');
    return;
  }

  const html = frame({
    preheader: `Welcome to SunoBro, ${name}. Your account is ready.`,
    eyebrow: 'Welcome',
    title: `Welcome, ${name}.`,
    intro: 'Your account is active. Orders, saved addresses, and the next drop all live in one place.',
    ctaHref: `${SITE}/account`,
    ctaLabel: 'Open your account',
  });

  try {
    await deliver({ to, subject: 'Welcome to SunoBro', html });
  } catch (err) {
    logger.error(err, 'Failed to send welcome email');
  }
};

const noticeRow = (label, detail) => `
<tr>
  <td style="padding:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#12151c;border:1px solid #2c3140;">
      <tr>
        <td style="width:4px;background:#c9d2ff;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 3px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c9d2ff;">
            ${esc(label)}
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#eceef6;">${esc(detail)}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

const sendDropNotice = async ({ to }) => {
  if (!mailConfigured()) {
    const error = new Error('Email transport not configured');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }

  const html = frame({
    preheader: "You're on the SunoBro list. We'll email you when the next drop goes live.",
    eyebrow: 'Drop list',
    title: "You're on the list.",
    intro: 'This address is saved. When a new tee or hoodie goes live, this inbox hears it first.',
    bodyHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
        <tr>
          <td style="padding:14px 16px;background:#12151c;border:1px solid #2c3140;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9aa0b5;">
              Confirmation sent to
            </p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">${esc(to)}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        ${noticeRow('Next drop', 'You get the note before the piece is public.')}
        ${noticeRow('Made to order', 'Heavyweight fabric, printed when you buy.')}
        ${noticeRow('Ships across India', 'The current collection is already open.')}
      </table>`,
    ctaHref: `${SITE}/products`,
    ctaLabel: 'Shop the collection',
  });

  await deliver({
    to,
    subject: "You're on the SunoBro list",
    html,
    text: [
      "You're on the SunoBro list.",
      '',
      `Confirmation sent to ${to}.`,
      'When a new tee or hoodie goes live, this inbox hears it first.',
      '',
      `Shop the collection: ${SITE}/products`,
    ].join('\n'),
  });
};

const STATUS_MAIL = {
  paid: {
    subject: (reference) => `Payment received — ${reference}`,
    title: 'Payment received.',
    body: 'Your payment is confirmed. The order is queued for production.',
  },
  shipped: {
    subject: (reference) => `Shipped — ${reference}`,
    title: 'Your order has shipped.',
    body: 'The parcel is with the courier.',
  },
  delivered: {
    subject: (reference) => `Delivered — ${reference}`,
    title: 'Delivered.',
    body: 'Your order was delivered.',
  },
  cancelled: {
    subject: (reference) => `Order cancelled — ${reference}`,
    title: 'Order cancelled.',
    body: 'This order was cancelled. If you were charged, the refund follows the refund policy.',
  },
};

const sendOrderStatus = async ({ to, order }) => {
  const copy = STATUS_MAIL[order.status];
  if (!copy || !to) return;
  if (!mailConfigured()) {
    logger.warn('Email transport not configured — skipping order status email');
    return;
  }

  const tracking = order.qikinkTrackingLink
    ? `<p style="margin:18px 0 0;font-size:14px;">
        <a href="${esc(order.qikinkTrackingLink)}" style="color:#c9d2ff;">Track shipment</a>
      </p>`
    : '';
  const courier = order.qikinkCourier
    ? `<p style="margin:12px 0 0;font-size:13px;color:#9aa0b5;">
        ${esc(order.qikinkCourier)}${order.qikinkAwb ? ` · ${esc(order.qikinkAwb)}` : ''}
      </p>`
    : '';

  const html = frame({
    preheader: `${copy.title} ${order.reference}`,
    eyebrow: 'Order',
    title: copy.title,
    intro: `${copy.body} Reference ${order.reference}.`,
    bodyHtml: `${courier}${tracking}`,
    ctaHref: order.qikinkTrackingLink || `${SITE}/account`,
    ctaLabel: order.qikinkTrackingLink ? 'Track shipment' : 'View your orders',
  });

  try {
    await deliver({ to, subject: copy.subject(order.reference), html });
  } catch (err) {
    logger.error(err, 'Failed to send order status email');
  }
};

module.exports = {
  sendOrderConfirmation, sendWelcome, sendDropNotice, sendOrderStatus,
};
