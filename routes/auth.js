const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { sendOtp } = require('../lib/whatsapp');
const { signToken, requireAuth } = require('../lib/authMiddleware');

function normalizeWA(num) {
  let n = String(num || '').replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n.startsWith('62')) n = '62' + n;
  return n;
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// STEP 1: Minta OTP - Login/Daftar tanpa password, cukup nomor WhatsApp
router.post('/otp/request', async (req, res) => {
  const whatsapp = normalizeWA(req.body.whatsapp);
  if (whatsapp.length < 10) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid.' });

  const code = genCode();
  const otps = db.readCollection('otps').filter((o) => o.whatsapp !== whatsapp); // hapus OTP lama nomor ini
  otps.push({ whatsapp, code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
  db.writeCollection('otps', otps);

  await sendOtp(whatsapp, code);

  const devMode = process.env.NODE_ENV !== 'production';
  res.json({
    ok: true,
    message: `Kode OTP telah dikirim ke WhatsApp ${whatsapp}.`,
    ...(devMode ? { devCode: code } : {}), // hanya tampil di mode development untuk memudahkan testing
  });
});

// STEP 2: Verifikasi OTP -> otomatis daftar jika user baru, lalu login
router.post('/otp/verify', (req, res) => {
  const whatsapp = normalizeWA(req.body.whatsapp);
  const { code, name } = req.body;

  const otps = db.readCollection('otps');
  const record = otps.find((o) => o.whatsapp === whatsapp);
  if (!record) return res.status(400).json({ error: 'Silakan minta kode OTP terlebih dahulu.' });
  if (Date.now() > record.expiresAt) return res.status(400).json({ error: 'Kode OTP sudah kadaluarsa.' });
  if (record.attempts >= 5) return res.status(400).json({ error: 'Terlalu banyak percobaan, minta kode baru.' });
  if (record.code !== String(code)) {
    record.attempts += 1;
    db.writeCollection('otps', otps);
    return res.status(400).json({ error: 'Kode OTP salah.' });
  }

  db.writeCollection('otps', otps.filter((o) => o.whatsapp !== whatsapp));

  let user = db.readCollection('users').find((u) => u.whatsapp === whatsapp);
  if (!user) {
    user = db.insert('users', {
      id: db.genId('usr'),
      whatsapp,
      name: name || `Pelaku UMKM ${whatsapp.slice(-4)}`,
      role: 'umkm',
      businessId: null,
      deviceTokens: [],
      createdAt: new Date().toISOString(),
    });
  }

  const token = signToken(user);
  res.json({ ok: true, token, user });
});

// Login cepat berikutnya via "remember this device" (token tersimpan di HP, tanpa OTP ulang)
router.post('/device-login', (req, res) => {
  const { token } = req.body;
  const jwt = require('jsonwebtoken');
  const { SECRET } = require('../lib/authMiddleware');
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.findById('users', payload.id);
    if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(401).json({ error: 'Token perangkat tidak valid, silakan login ulang dengan OTP.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.findById('users', req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  res.json({ user });
});

router.put('/me', requireAuth, (req, res) => {
  const { name, address } = req.body;
  const updated = db.update('users', req.user.id, {
    ...(name ? { name } : {}),
    ...(address ? { address } : {}),
  });
  res.json({ user: updated });
});

module.exports = router;
