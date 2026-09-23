require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== API ROUTES =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/operasional', require('./routes/operasional'));   // Keuangan, Stok, Kasir
app.use('/api/pembayaran', require('./routes/pembayaran'));     // QRIS, Pembiayaan BUMDes
app.use('/api/pemasaran', require('./routes/pemasaran'));       // Katalog, Logistik, Marketplace
app.use('/api/edukasi', require('./routes/edukasi'));           // Perizinan, Pojok Belajar

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'Super App UMKM Kelurahan Langkapura', time: new Date().toISOString() });
});

// ===== FRONTEND (PWA statis) =====
app.use(express.static(path.join(__dirname, 'public')));

// Halaman toko publik /toko/:slug -> tetap render index.html (SPA menangani routing di client)
app.get('/toko/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('==========================================================');
  console.log(' SUPER APP UMKM KELURAHAN LANGKAPURA - Bandar Lampung');
  console.log(` Server berjalan di: http://localhost:${PORT}`);
  console.log('==========================================================');
});
