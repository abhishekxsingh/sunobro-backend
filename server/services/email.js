const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const FROM = process.env.FROM_EMAIL || 'SunoBro <orders@sunobro.com>';
const SITE = 'https://www.sunobro.com';
const LOGO = `${SITE}/brand/logo-mark-192.png`;
const SOCIAL = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/officialsunobro/',
    cid: 'social-instagram',
    file: path.join(__dirname, '../assets/email/instagram.png'),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/profile.php?id=61553027412800',
    cid: 'social-facebook',
    file: path.join(__dirname, '../assets/email/facebook.png'),
  },
];

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

const socialAttachments = () => SOCIAL.map((link) => ({
  filename: path.basename(link.file),
  path: link.file,
  cid: link.cid,
}));

const deliver = async ({ to, subject, html, text }) => {
  const smtp = getSmtp();
  if (smtp) {
    const from = process.env.SMTP_FROM || `SunoBro <${process.env.SMTP_USER}>`;
    await smtp.sendMail({
      from, to, subject, html, text,
      attachments: socialAttachments(),
    });
    return;
  }

  const resend = getResend();
  if (!resend) return;
  const result = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments: SOCIAL.map((link) => ({
      filename: path.basename(link.file),
      content: fs.readFileSync(link.file).toString('base64'),
      content_type: 'image/png',
      content_id: link.cid,
    })),
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

const fill = (hex) =>
  `background-color:${hex};background-image:linear-gradient(${hex},${hex});`;
const ink = (hex) => `color:${hex};-webkit-text-fill-color:${hex};`;

const button = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px">
  <tr>
    <td bgcolor="#c9d2ff" style="${fill('#c9d2ff')}">
      <a href="${esc(href)}"
        style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;
        font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
        ${ink('#1c2140')};text-decoration:none;">
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
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
  </style>
</head>
<body bgcolor="#101218" style="margin:0;padding:0;${fill('#101218')}${ink('#eceef6')}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;${ink('#101218')}">
    ${esc(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#101218" style="${fill('#101218')}">
    <tr>
      <td align="center" bgcolor="#101218" style="padding:28px 12px;${fill('#101218')}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#171a22"
          style="max-width:560px;${fill('#171a22')}border:1px solid #2c3140;">
          <tr>
            <td bgcolor="#c9d2ff" style="height:4px;${fill('#c9d2ff')}font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td bgcolor="#171a22" style="padding:32px 28px 28px;${fill('#171a22')}font-family:Arial,Helvetica,sans-serif;${ink('#eceef6')}">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td bgcolor="#171a22" style="padding-right:12px;vertical-align:middle;${fill('#171a22')}">
                    <img src="${LOGO}" width="40" height="40" alt="SunoBro"
                      style="display:block;width:40px;height:40px;border:0;border-radius:10px;outline:none;" />
                  </td>
                  <td bgcolor="#171a22" style="vertical-align:middle;${fill('#171a22')}font-family:Arial,Helvetica,sans-serif;
                    font-size:14px;letter-spacing:0.22em;font-weight:700;${ink('#c9d2ff')}">
                    SUNOBRO
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;${ink('#b7becf')}">
                ${esc(eyebrow)}
              </p>
              <h1 style="margin:0 0 14px;font-size:32px;line-height:1.15;font-weight:700;${ink('#ffffff')}">
                ${esc(title)}
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.7;${ink('#e4e7f0')}">
                ${esc(intro)}
              </p>
              ${bodyHtml || ''}
              ${ctaHref ? button(ctaHref, ctaLabel) : ''}
              <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #2c3140;
                font-size:12px;line-height:1.7;${ink('#9aa3b8')}">
                240+ GSM · Print on demand · Ships across India<br>
                <a href="${SITE}" style="${ink('#c9d2ff')};text-decoration:none;">www.sunobro.com</a>
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                <tr>
                  ${SOCIAL.map((link) => `
                  <td bgcolor="#12151c" style="padding:8px 14px;${fill('#12151c')}border:1px solid #2c3140;">
                    <a href="${esc(link.href)}" style="text-decoration:none;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td bgcolor="#12151c" style="vertical-align:middle;padding-right:8px;${fill('#12151c')}">
                            <img src="cid:${link.cid}" width="18" height="18" alt=""
                              style="display:block;width:18px;height:18px;border:0;outline:none;" />
                          </td>
                          <td bgcolor="#12151c" style="vertical-align:middle;${fill('#12151c')}font-family:Arial,Helvetica,sans-serif;
                            font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;${ink('#c9d2ff')}">
                            ${esc(link.label)}
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`).join('')}
                </tr>
              </table>
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
      <td style="padding:10px 0;border-bottom:1px solid #2c3140;font-size:14px;${ink('#eceef6')}">
        ${esc(item.name)}<br>
        <span style="font-size:12px;${ink('#b7becf')}">${esc(item.size)} / ${esc(item.color)}</span>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #2c3140;text-align:center;${ink('#e4e7f0')}">
        ${esc(item.qty)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #2c3140;text-align:right;${ink('#eceef6')}">
        ${esc(money(item.price * item.qty, order.currency))}
      </td>
    </tr>`).join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="padding:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;${ink('#b7becf')}">Item</td>
        <td style="padding:0 8px 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;${ink('#b7becf')};text-align:center;">Qty</td>
        <td style="padding:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;${ink('#b7becf')};text-align:right;">Subtotal</td>
      </tr>
      ${itemRows}
      ${order.discount > 0 ? `
      <tr>
        <td colspan="2" style="padding-top:12px;font-size:13px;color:#9aa0b5;">
          Coupon ${esc(order.couponCode || '')}
        </td>
        <td style="padding-top:12px;text-align:right;font-size:13px;color:#7ee2b8;">
          −${esc(money(order.discount, order.currency))}
        </td>
      </tr>` : ''}
      <tr>
        <td colspan="2" style="padding-top:16px;font-size:16px;font-weight:700;${ink('#ffffff')}">Total</td>
        <td style="padding-top:16px;text-align:right;font-size:16px;font-weight:700;${ink('#c9d2ff')}">
          ${esc(money(order.total, order.currency))}
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;${ink('#b7becf')}">
      Shipping to
    </p>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;${ink('#eceef6')}">
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#12151c"
      style="${fill('#12151c')}border:1px solid #2c3140;">
      <tr>
        <td bgcolor="#c9d2ff" style="width:4px;${fill('#c9d2ff')}font-size:0;line-height:0;">&nbsp;</td>
        <td bgcolor="#12151c" style="padding:12px 14px;${fill('#12151c')}font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 3px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;${ink('#c9d2ff')}">
            ${esc(label)}
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;${ink('#eceef6')}">${esc(detail)}</p>
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
          <td bgcolor="#12151c" style="padding:14px 16px;${fill('#12151c')}border:1px solid #2c3140;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;${ink('#b7becf')}">
              Confirmation sent to
            </p>
            <p style="margin:0;font-size:16px;font-weight:700;${ink('#ffffff')}">${esc(to)}</p>
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
        <a href="${esc(order.qikinkTrackingLink)}" style="${ink('#c9d2ff')};">Track shipment</a>
      </p>`
    : '';
  const courier = order.qikinkCourier
    ? `<p style="margin:12px 0 0;font-size:13px;${ink('#b7becf')}">
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
