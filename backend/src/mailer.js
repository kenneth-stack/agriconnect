// All outgoing email goes through sendMail(). To switch to another provider later, change only this function.
export async function sendMail(to, subject, text) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
  try {
    const r = await fetch(process.env.MAIL_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text })
    });
    if (!r.ok) console.error('Email failed', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('Email failed', e.message);
    return false;
  }
}

const NEXT_STEP = {
  farmer: 'Complete your KYC profile, then list your produce with photos and request farm assistance.',
  investor: 'Complete your KYC profile, then explore our investment plans from 12 months to 5 years.',
  buyer: 'Complete your KYC profile, then browse fresh produce from farmers in your state.'
};

// Sent after a successful sign-up. Never blocks or fails the registration.
export async function sendWelcome({ name, email, role }) {
  const base = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
  const sent = await sendMail(email, 'Welcome to AgriConnect Africa',
    `Hello ${name},\n\nWelcome to AgriConnect Africa! Your ${role} account is ready.\n\nNext step: ${NEXT_STEP[role] || ''}\n\nLog in here: ${base}/login\n\nThe AgriConnect team`);
  if (!sent) console.log('Welcome email not sent (email is not set up yet) for', email);
}
