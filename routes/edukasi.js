const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/authMiddleware');

/* ============ 9. KONSULTASI & PERIZINAN (panduan mandiri NIB, Halal, P-IRT) ============ */
const PANDUAN_PERIZINAN = {
  NIB: {
    nama: 'Nomor Induk Berusaha (NIB)',
    deskripsi: 'Identitas resmi pelaku usaha, menjadi syarat wajib untuk mengakses banyak program bantuan & pembiayaan pemerintah.',
    estimasiWaktu: '±30-60 menit, online, gratis',
    langkah: [
      { step: 1, judul: 'Siapkan dokumen', detail: 'NIK KTP, alamat usaha, jenis/bidang usaha, dan email aktif.' },
      { step: 2, judul: 'Buat akun OSS', detail: 'Daftar akun di situs OSS (Online Single Submission) resmi pemerintah menggunakan NIK.' },
      { step: 3, judul: 'Isi data usaha', detail: 'Lengkapi data usaha, skala usaha (mikro/kecil), dan lokasi usaha.' },
      { step: 4, judul: 'Pilih KBLI sesuai usaha', detail: 'Pilih kode klasifikasi usaha yang sesuai jenis dagangan/jasa Anda.' },
      { step: 5, judul: 'Terbitkan NIB', detail: 'Setelah data benar, NIB dapat langsung diunduh dalam bentuk dokumen digital.' },
    ],
  },
  Halal: {
    nama: 'Sertifikasi Halal',
    deskripsi: 'Wajib bagi produk makanan/minuman agar konsumen yakin dan pasar semakin luas.',
    estimasiWaktu: '±7-40 hari kerja tergantung jalur (self-declare untuk usaha mikro biasanya lebih cepat)',
    langkah: [
      { step: 1, judul: 'Miliki NIB terlebih dahulu', detail: 'Sertifikasi halal mensyaratkan usaha sudah memiliki NIB.' },
      { step: 2, judul: 'Daftar via SIHALAL', detail: 'Ajukan permohonan melalui sistem SIHALAL milik BPJPH (bisa dibantu pendamping PPH setempat).' },
      { step: 3, judul: 'Pilih jalur self-declare (UMK)', detail: 'Untuk usaha mikro dengan bahan & proses sederhana, tersedia jalur pernyataan mandiri yang lebih cepat & bisa gratis lewat program pemerintah.' },
      { step: 4, judul: 'Verifikasi oleh pendamping', detail: 'Pendamping Proses Produk Halal (PPH) akan memeriksa kesesuaian bahan dan proses produksi.' },
      { step: 5, judul: 'Terbit sertifikat halal', detail: 'Sertifikat dapat diunduh secara digital setelah disetujui.' },
    ],
  },
  PIRT: {
    nama: 'P-IRT (Izin Produksi Pangan Industri Rumah Tangga)',
    deskripsi: 'Izin untuk produk pangan olahan rumahan agar boleh dijual bebas dan mencantumkan nomor izin di kemasan.',
    estimasiWaktu: '±1-2 minggu setelah penyuluhan keamanan pangan',
    langkah: [
      { step: 1, judul: 'Ikuti Penyuluhan Keamanan Pangan (PKP)', detail: 'Wajib mengikuti pelatihan yang diselenggarakan Dinas Kesehatan setempat.' },
      { step: 2, judul: 'Siapkan dokumen usaha', detail: 'KTP, NIB, denah lokasi produksi, dan label kemasan produk.' },
      { step: 3, judul: 'Ajukan ke Dinas Kesehatan/DPMPTSP', detail: 'Serahkan berkas permohonan P-IRT ke instansi terkait di Kota Bandar Lampung.' },
      { step: 4, judul: 'Survei lokasi produksi', detail: 'Petugas akan meninjau kelayakan tempat produksi dari sisi kebersihan dan keamanan pangan.' },
      { step: 5, judul: 'Terbit nomor P-IRT', detail: 'Nomor P-IRT dicantumkan pada label kemasan produk sesuai ketentuan.' },
    ],
  },
};

router.get('/perizinan/panduan', (req, res) => {
  res.json({ items: PANDUAN_PERIZINAN });
});

router.get('/perizinan/panduan/:jenis', (req, res) => {
  const data = PANDUAN_PERIZINAN[req.params.jenis];
  if (!data) return res.status(404).json({ error: 'Jenis perizinan tidak ditemukan. Pilih: NIB, Halal, atau PIRT.' });
  res.json({ jenis: req.params.jenis, ...data });
});

router.use(requireAuth);

// Lacak progres pengurusan izin milik pengguna (checklist mandiri)
router.get('/perizinan/progres', (req, res) => {
  const items = db.readCollection('licensing_progress').filter((p) => p.userId === req.user.id);
  res.json({ items });
});

router.post('/perizinan/progres', (req, res) => {
  const { jenis } = req.body;
  if (!PANDUAN_PERIZINAN[jenis]) return res.status(400).json({ error: 'Jenis perizinan tidak valid.' });
  let progress = db.readCollection('licensing_progress').find((p) => p.userId === req.user.id && p.jenis === jenis);
  if (!progress) {
    progress = db.insert('licensing_progress', {
      id: db.genId('lic'), userId: req.user.id, jenis, completedSteps: [], status: 'berjalan',
      createdAt: new Date().toISOString(),
    });
  }
  res.json({ progress });
});

router.put('/perizinan/progres/:id/toggle-step', (req, res) => {
  const progress = db.findById('licensing_progress', req.params.id);
  if (!progress || progress.userId !== req.user.id) return res.status(404).json({ error: 'Data progres tidak ditemukan.' });
  const { step } = req.body;
  let completed = progress.completedSteps || [];
  completed = completed.includes(step) ? completed.filter((s) => s !== step) : [...completed, step];
  const totalSteps = PANDUAN_PERIZINAN[progress.jenis].langkah.length;
  const status = completed.length >= totalSteps ? 'selesai' : 'berjalan';
  res.json({ progress: db.update('licensing_progress', progress.id, { completedSteps: completed, status }) });
});

/* ============ 10. POJOK BELAJAR UMKM (video/tips ringan, hemat kuota) ============ */
router.get('/belajar/konten', (req, res) => {
  const { tag } = req.query;
  let items = db.readCollection('learning_content');
  if (tag) items = items.filter((c) => (c.tags || []).includes(tag));
  res.json({ items });
});

router.get('/belajar/konten/:id', (req, res) => {
  const item = db.findById('learning_content', req.params.id);
  if (!item) return res.status(404).json({ error: 'Konten tidak ditemukan.' });
  res.json({ item });
});

// Admin/kelurahan bisa menambah konten edukasi baru
router.post('/belajar/konten', requireRole('admin'), (req, res) => {
  const { title, type, url, durationSec, sizeKb, summary, tags } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'Judul dan tipe konten wajib diisi.' });
  const item = db.insert('learning_content', {
    id: db.genId('edu'), title, type, url: url || '', durationSec: durationSec || 0,
    sizeKb: sizeKb || 0, summary: summary || '', tags: tags || [], createdAt: new Date().toISOString(),
  });
  res.json({ item });
});

module.exports = router;
