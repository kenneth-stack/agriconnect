// All outgoing email goes through sendMail(). To switch to another provider later, change only this function.
// Sent from MAIL_FROM (e.g. "AgriConnect <notification@agriconnect.com>"); replies go to CONTACT_EMAIL (contact@agriconnect.com).
export const siteUrl = () => (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
export const contactEmail = () => process.env.CONTACT_EMAIL || 'contact@agriconnect.com';
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendMail(to, subject, text, { html, replyTo } = {}) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
  try {
    const r = await fetch(process.env.MAIL_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, ...(html && { html }), reply_to: replyTo || contactEmail() })
    });
    if (!r.ok) console.error('Email failed', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('Email failed', e.message);
    return false;
  }
}

// One simple branded layout for every notification (plain-text version included)
function compose({ title, paragraphs = [], rows = [], button }) {
  const text = [title, '', ...paragraphs, ...(rows.length ? ['', ...rows.map(([k, v]) => `${k}: ${v}`)] : []), ...(button ? ['', `${button.label}: ${button.url}`] : []),
    '', 'The AgriConnect team', `Questions? Write to ${contactEmail()}`].join('\n');
  const cell = 'padding:6px 0;border-top:1px solid #e3ebe6;';
  const html = `<div style="background:#f7faf8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#16241c"><table role="presentation" align="center" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #cfdcd5;border-radius:8px;border-collapse:separate"><tr><td style="background:#1d6b43;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;border-radius:8px 8px 0 0">AgriConnect Africa</td></tr><tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${esc(p)}</p>`).join('')}${rows.length ? `<table role="presentation" width="100%" style="margin:8px 0 16px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="${cell}color:#556a5e">${esc(k)}</td><td style="${cell}text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>` : ''}${button ? `<p style="margin:16px 0"><a href="${esc(button.url)}" style="background:#1d6b43;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${esc(button.label)}</a></p>` : ''}<p style="margin:16px 0 0;color:#556a5e;font-size:13px">The AgriConnect team<br>Questions? Write to <a href="mailto:${esc(contactEmail())}">${esc(contactEmail())}</a></p></td></tr></table></div>`;
  return { text, html };
}

// Notifications never block or fail the action that triggered them; a failure is only logged.
async function notify(to, subject, spec) {
  if (!to) return false;
  const { text, html } = compose(spec);
  const sent = await sendMail(to, subject, text, { html });
  if (!sent) console.log(`Email "${subject}" was not sent to ${to} (email is not set up, or it failed)`);
  return sent;
}

const NEXT_STEP = {
  farmer: 'Complete your KYC profile, then list your produce with photos and request farm assistance.',
  investor: 'Complete your KYC profile, then explore our investment plans from 12 months to 5 years.',
  buyer: 'Complete your KYC profile, then browse fresh produce from farmers in your state.'
};

export const sendWelcome = ({ name, email, role }) => notify(email, 'Welcome to AgriConnect Africa', {
  title: `Welcome, ${name}!`, paragraphs: [`Your ${role} account is ready.`, `Next step: ${NEXT_STEP[role] || 'Log in to get started.'}`], button: { label: 'Log in', url: `${siteUrl()}/login` }
});

export const sendPasswordReset = ({ name, email, link }) => notify(email, 'Reset your AgriConnect password', {
  title: 'Reset your password',
  paragraphs: [`Hello ${name},`, 'Use the button below within 1 hour to choose a new password. If you did not ask for this, you can safely ignore this email.'],
  button: { label: 'Choose a new password', url: link }
});

export const sendWalletFunded = ({ name, email, amount, balance, byTransfer }) => notify(email, `${naira(amount)} added to your wallet`, {
  title: 'Money added to your wallet',
  paragraphs: [`Hello ${name},`, byTransfer ? `We received your bank transfer of ${naira(amount)} and it is now in your wallet.` : `${naira(amount)} was credited to your wallet by AgriConnect.`],
  rows: [['Amount', naira(amount)], ['New balance', naira(balance)]], button: { label: 'Open my wallet', url: `${siteUrl()}/wallet` }
});

export const sendKycResult = ({ name, email, status, note }) => status === 'verified'
  ? notify(email, 'Your KYC is verified', { title: 'Your KYC profile is verified', paragraphs: [`Hello ${name},`, 'Thank you. Your identity has been verified, and your account now has full access.'], button: { label: 'Go to my dashboard', url: `${siteUrl()}/dashboard` } })
  : notify(email, 'Your KYC needs attention', { title: 'Your KYC profile was not approved', paragraphs: [`Hello ${name},`, `We could not approve your KYC profile${note ? `: ${note}` : '.'}`, 'Please correct it and submit again.'], button: { label: 'Update my KYC', url: `${siteUrl()}/kyc` } });

// Orders: placed (buyer receipt + new-order alert for the farmer), confirmed (delivery activated), completed (delivered / collected)
export async function sendOrderEmail(o, kind) {
  const pickup = o.fulfilment === 'pickup';
  const rows = [['Order', `#${o.id}`], ['Produce', `${o.quantity} ${o.unit} of ${o.title}`], ['Produce price', naira(o.items_total ?? o.total)],
    ...(o.delivery_fee > 0 ? [['Delivery fee', naira(o.delivery_fee)]] : []), ['Total', naira(o.total)],
    ['Payment', o.payment_method === 'wallet' ? 'Paid from wallet' : 'Pay on delivery'], [pickup ? 'Pickup' : 'Delivery', pickup ? 'You collect it from the farm' : (o.delivery_state || '')]];
  const track = { label: 'Track my order', url: `${siteUrl()}/history` };
  if (kind === 'placed') {
    await notify(o.buyer_email, `Order #${o.id} received`, { title: 'We received your order', paragraphs: [`Hello ${o.buyer_name}, your order has been sent to ${o.farmer_name} to confirm. We will email you when it is confirmed.`], rows, button: track });
    await notify(o.farmer_email, `New order #${o.id}: ${o.quantity} ${o.unit} of ${o.title}`, { title: 'You have a new order', paragraphs: [`Hello ${o.farmer_name}, ${o.buyer_name} ordered ${o.quantity} ${o.unit} of ${o.title}. Please confirm the order.`], rows: rows.filter((r) => r[0] !== 'Payment').concat([['Payment', o.payment_method === 'wallet' ? 'Already paid (held by AgriConnect)' : 'Pay on delivery']]), button: { label: 'Review the order', url: `${siteUrl()}/dashboard` } });
  } else if (kind === 'confirmed') {
    await notify(o.buyer_email, pickup ? `Order #${o.id} confirmed: ready for pickup` : `Order #${o.id} confirmed: delivery is on the way`, {
      title: pickup ? 'Your order is ready for pickup' : 'Delivery has started',
      paragraphs: [pickup ? `Hello ${o.buyer_name}, ${o.farmer_name} confirmed your order. You can now collect it.` : `Hello ${o.buyer_name}, ${o.farmer_name} confirmed your order and delivery is now on the way.`], rows, button: track });
  } else if (kind === 'completed') {
    await notify(o.buyer_email, pickup ? `Order #${o.id} collected` : `Order #${o.id} delivered`, {
      title: pickup ? 'Order collected' : 'Order delivered', paragraphs: [`Hello ${o.buyer_name}, your order #${o.id} is marked as ${pickup ? 'collected' : 'delivered'}. Thank you for buying on AgriConnect.`], rows, button: { label: 'See my orders', url: `${siteUrl()}/history` } });
  }
}

// A message from the website's contact form goes to contact@agriconnect.com; replying to it goes straight to the visitor.
export const sendContactMessage = ({ name, email, subject, message }) =>
  sendMail(contactEmail(), `[Contact form] ${subject}`, `From: ${name} <${email}>\n\n${message}`, { replyTo: email });
