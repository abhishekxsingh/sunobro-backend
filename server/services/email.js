const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const FROM = process.env.FROM_EMAIL || 'SunoBro <orders@sunobro.com>';

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

const deliver = async ({ to, subject, html }) => {
  const smtp = getSmtp();
  if (smtp) {
    const from = process.env.SMTP_FROM || `SunoBro <${process.env.SMTP_USER}>`;
    await smtp.sendMail({
      from,
      to,
      subject,
      html,
    });
    return;
  }

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
};

const money = (n, cur = 'INR') => `${cur === 'INR' ? '₹' : '$'}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const baseStyle = `
  body { font-family: 'Courier New', monospace; background: #0f0f14; color: #ebebf5; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .logo { font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #c5c9f5; margin-bottom: 32px; }
  .divider { border: none; border-top: 1px solid #2a2a3d; margin: 24px 0; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #8888aa; }
  .value { font-size: 14px; color: #ebebf5; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8888aa; text-align: left; padding: 8px 0; border-bottom: 1px solid #2a2a3d; }
  td { font-size: 13px; padding: 10px 0; border-bottom: 1px solid #1a1a2a; vertical-align: top; }
  .total-row td { border-top: 1px solid #2a2a3d; border-bottom: none; font-weight: bold; padding-top: 16px; font-size: 16px; }
  .badge { display: inline-block; padding: 2px 8px; background: #1e2a1e; color: #7ec87e;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase; border: 1px solid #2a3d2a; }
  .footer { font-size: 11px; color: #555570; margin-top: 40px; }
  a { color: #c5c9f5; }
`;

const sendOrderConfirmation = async ({ to, order }) => {
  if (!mailConfigured()) {
    logger.warn('Email transport not configured — skipping order confirmation email');
    return;
  }

  const itemRows = order.items.map((item) => `
    <tr>
      <td>${item.name}<br><span style="color:#8888aa;font-size:11px">${item.size} / ${item.color}</span></td>
      <td style="text-align:center">${item.qty}</td>
      <td style="text-align:right">${money(item.price * item.qty, order.currency)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
  <body><div class="wrap">
    <div class="logo">// SUNOBRO</div>
    <h1 style="font-size:24px;margin:0 0 8px">Order Confirmed</h1>
    <p style="color:#8888aa;font-size:13px;margin:0 0 32px">
      Reference: <strong style="color:#c5c9f5">${order.reference}</strong>
      &nbsp;<span class="badge">PENDING</span>
    </p>
    <hr class="divider">
    <table>
      <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="2">Total</td>
          <td style="text-align:right">${money(order.total, order.currency)}</td>
        </tr>
      </tfoot>
    </table>
    <hr class="divider">
    <div class="label">Shipping to</div>
    <div class="value" style="margin-top:8px">
      ${order.shippingFirstName} ${order.shippingLastName}<br>
      ${order.shippingStreet}<br>
      ${order.shippingCity}, ${order.shippingPostalCode}<br>
      ${order.shippingCountry}
    </div>
    <hr class="divider">
    <p class="footer">
      You'll receive another email when your order ships.<br>
      Questions? Reply to this email or visit sunobro.com.<br><br>
      — SunoBro Technical Ops
    </p>
  </div></body></html>`;

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

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
  <body><div class="wrap">
    <div class="logo">// SUNOBRO</div>
    <h1 style="font-size:24px;margin:0 0 8px">Welcome, ${name}.</h1>
    <p style="color:#8888aa;font-size:13px;margin:0 0 32px">Your account is active.</p>
    <hr class="divider">
    <p style="font-size:14px;line-height:1.7">
      You're now part of the SunoBro network. Browse our technical goods collection,
      track your orders, and manage your profile at any time.
    </p>
    <hr class="divider">
    <p class="footer">— SunoBro Technical Ops</p>
  </div></body></html>`;

  try {
    await deliver({ to, subject: 'Welcome to SunoBro', html });
  } catch (err) {
    logger.error(err, 'Failed to send welcome email');
  }
};

const sendDropNotice = async ({ to }) => {
  if (!mailConfigured()) {
    const error = new Error('Email transport not configured');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
  <body><div class="wrap">
    <div class="logo">// SUNOBRO</div>
    <h1 style="font-size:24px;margin:0 0 8px">You're on the list.</h1>
    <p style="color:#8888aa;font-size:13px;margin:0 0 32px">Next drop · early notice</p>
    <hr class="divider">
    <p style="font-size:14px;line-height:1.7">
      We'll email this address when the next technical piece goes live.
    </p>
    <hr class="divider">
    <p class="footer">— SunoBro Technical Ops</p>
  </div></body></html>`;

  await deliver({
    to,
    subject: "You're on the list for the next SunoBro drop",
    html,
  });
};

const STATUS_MAIL = {
  paid: {
    subject: (reference) => `Payment received — ${reference}`,
    title: 'Payment received',
    body: 'Your payment is confirmed. The order is queued for production.',
  },
  shipped: {
    subject: (reference) => `Shipped — ${reference}`,
    title: 'Your order has shipped',
    body: 'The parcel is with the courier.',
  },
  delivered: {
    subject: (reference) => `Delivered — ${reference}`,
    title: 'Delivered',
    body: 'Your order was delivered.',
  },
  cancelled: {
    subject: (reference) => `Order cancelled — ${reference}`,
    title: 'Order cancelled',
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
    ? `<p style="font-size:14px"><a href="${order.qikinkTrackingLink}">Track shipment</a></p>`
    : '';
  const courier = order.qikinkCourier
    ? `<p style="color:#8888aa;font-size:13px">${order.qikinkCourier}${order.qikinkAwb ? ` · ${order.qikinkAwb}` : ''}</p>`
    : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
  <body><div class="wrap">
    <div class="logo">// SUNOBRO</div>
    <h1 style="font-size:24px;margin:0 0 8px">${copy.title}</h1>
    <p style="color:#8888aa;font-size:13px;margin:0 0 32px">Reference: <strong style="color:#c5c9f5">${order.reference}</strong></p>
    <hr class="divider">
    <p style="font-size:14px;line-height:1.7">${copy.body}</p>
    ${courier}
    ${tracking}
    <hr class="divider">
    <p class="footer">— SunoBro Technical Ops</p>
  </div></body></html>`;

  try {
    await deliver({ to, subject: copy.subject(order.reference), html });
  } catch (err) {
    logger.error(err, 'Failed to send order status email');
  }
};

module.exports = {
  sendOrderConfirmation, sendWelcome, sendDropNotice, sendOrderStatus,
};
