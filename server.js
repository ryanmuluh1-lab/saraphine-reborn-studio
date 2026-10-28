require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const INQUIRY_TO = process.env.INQUIRY_TO || 'saraphinerebornstudio1@gmail.com';

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '25kb' }));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));
app.use('/api/inquiries', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many inquiries from this connection. Please try again later.' } }));

function clean(value, max = 2000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
function mailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Saraphine Reborn Studio inquiry service' }));
app.post('/api/inquiries', async (req, res) => {
  try {
    // Honeypot: bots sometimes fill this hidden field; respond without sending mail.
    if (clean(req.body.website, 200)) return res.status(200).json({ ok: true, message: 'Inquiry received.' });
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 254);
    const product = clean(req.body.product, 180) || 'General inquiry';
    const message = clean(req.body.message, 4000);
    if (!name || !email || !validEmail(email)) return res.status(400).json({ error: 'Please enter your name and a valid email address.' });
    if (!message) return res.status(400).json({ error: 'Please enter a message so we know how to help.' });
    if (!mailerConfigured()) return res.status(503).json({ error: 'Email delivery is not configured yet. Use the email fallback shown on this page or contact the site owner to finish setup.' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: INQUIRY_TO,
      replyTo: { name, address: email },
      subject: `Website inquiry — ${product}`,
      text: `New inquiry from the Saraphine Reborn Studio website\n\nName: ${name}\nEmail: ${email}\nInterested in: ${product}\n\nMessage:\n${message}\n\nReply directly to this email to contact the customer.`,
      textEncoding: 'quoted-printable'
    });
    return res.status(201).json({ ok: true, message: 'Your inquiry has been sent. Thank you — we will get back to you.' });
  } catch (err) {
    console.error('Inquiry delivery failed:', err && err.message ? err.message : 'unknown error');
    return res.status(500).json({ error: 'We could not send your inquiry right now. Please use the email or WhatsApp contact option.' });
  }
});

// Serve the two HTML pages from the same origin so the inquiry form can call /api/inquiries.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.listen(PORT, () => console.log(`Saraphine Reborn Studio running on port ${PORT}`));
