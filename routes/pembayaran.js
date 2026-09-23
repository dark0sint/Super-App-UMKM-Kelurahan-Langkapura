const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/authMiddleware');
const { requireBusiness } = require('./operasional');

router.use(requireAuth);

/* ============ 4. INTEGRASI QRIS DESA ============ */
/**
 * CATATAN PRODUKSI: QRIS resmi (agar bisa dipindai semua e-wallet & bank) wajib diterbitkan oleh
 * PJSP/bank yang sudah tersertifikasi Bank Indonesia (mis. lewat partner seperti Xendit, Midtrans,
 * atau bank penyalur BUMDes). Endpoint di bawah menghasilkan kode QR yang merepresentasikan
 * "kode QRIS merchant" milik UMKM sehingga alur transaksi & rekonsiliasi bisa disiapkan;
 * saat kredensial PJSP sudah ada, cukup ganti isi generatePayload() dengan payload EMVCo resmi
 * dari API PJSP tersebut, sisanya (rekonsiliasi, pencatatan otomatis) tidak perlu diubah.
 */
router.get('/qris/kode', requireBusiness, async (req, res) => {
  const payload = `QRIS-LANGKAPURA|MERCHANT:${req.business.qrisMerchantCode}|NAMA:${req.business.name}`;
  try {
    const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
    res.json({ merchantCode: req.business.qrisMerchantCode, qrImage: dataUrl, catatan: 'QR statis merchant. Untuk QRIS dinamis per-nominal, gunakan endpoint /qris/kode-nominal.' });
  } catch (e) {
    res.status(500).json({ error: 'Gagal membuat kode QRIS.' });
  }
});

router.post('/qris/kode-nominal', requireBusiness, async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Nominal wajib diisi.' });
  const payload = `QRIS-LANGKAPURA|MERCHANT:${req.business.qrisMerchantCode}|JUMLAH:${amount}|CATATAN:${note || '-'}`;
  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });

  const pending = db.insert('qris_payments', {
    id: db.genId('qp'), businessId: req.business.id, amount: Number(amount), note: note || '',
    status: 'pending', createdAt: new Date().toISOString(),
  });

  res.json({ qrImage: dataUrl, paymentId: pending.id, catatan: 'Simulasikan pembayaran via endpoint /qris/simulasi-bayar/:id (untuk demo tanpa PJSP).' });
});

// Simulasi callback webhook dari penyedia QRIS (di produksi ini dipanggil otomatis oleh PJSP)
router.post('/qris/simulasi-bayar/:id', requireBusiness, (req, res) => {
  const payment = db.findById('qris_payments', req.params.id);
  if (!payment || payment.businessId !== req.business.id) return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan.' });
  db.update('qris_payments', payment.id, { status: 'paid', paidAt: new Date().toISOString() });
  db.insert('transactions', {
    id: db.genId('trx'), businessId: req.business.id, type: 'income', category: 'QRIS',
    amount: payment.amount, description: payment.note || 'Pembayaran QRIS', source: 'qris', refId: payment.id,
    date: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  res.json({ ok: true, message: 'Pembayaran QRIS berhasil dicatat otomatis ke pembukuan.' });
});

router.get('/qris/riwayat', requireBusiness, (req, res) => {
  const items = db.readCollection('qris_payments').filter((p) => p.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

/* ============ 5. KEMITRAAN BUMDES & LPD (Pembiayaan Mikro) ============ */
router.post('/pembiayaan/ajukan', requireBusiness, (req, res) => {
  const { amount, purpose, tenorBulan } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Jumlah pengajuan wajib diisi.' });
  if (!purpose) return res.status(400).json({ error: 'Tujuan penggunaan dana wajib diisi.' });
  const loan = db.insert('loans', {
    id: db.genId('loan'), businessId: req.business.id, applicantId: req.user.id,
    amount: Number(amount), purpose, tenorBulan: Number(tenorBulan || 6),
    status: 'pending', bumdesNote: '', createdAt: new Date().toISOString(),
  });
  res.json({ loan });
});

router.get('/pembiayaan/riwayat', requireBusiness, (req, res) => {
  const items = db.readCollection('loans').filter((l) => l.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

// Panel BUMDes/LPD (role admin/bumdes) untuk meninjau semua pengajuan pembiayaan
router.get('/pembiayaan/admin/semua', requireRole('admin', 'bumdes'), (req, res) => {
  const loans = db.readCollection('loans');
  const businesses = db.readCollection('businesses');
  const enriched = loans.map((l) => ({ ...l, business: businesses.find((b) => b.id === l.businessId) || null }));
  res.json({ items: enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

router.put('/pembiayaan/admin/:id/keputusan', requireRole('admin', 'bumdes'), (req, res) => {
  const { status, bumdesNote } = req.body;
  if (!['approved', 'rejected', 'disbursed'].includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
  const loan = db.findById('loans', req.params.id);
  if (!loan) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
  const updated = db.update('loans', loan.id, { status, bumdesNote: bumdesNote || loan.bumdesNote, decidedAt: new Date().toISOString() });
  res.json({ loan: updated });
});

module.exports = router;
