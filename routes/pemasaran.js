const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth } = require('../lib/authMiddleware');
const { requireBusiness } = require('./operasional');

/* ============ 6. KATALOG PRODUK DIGITAL (toko online mini via link) ============ */
// PUBLIK - tidak perlu login, agar bisa dibagikan ke WhatsApp/medsos
router.get('/katalog/publik/:slug', (req, res) => {
  const business = db.readCollection('businesses').find((b) => b.catalogSlug === req.params.slug && b.isActive);
  if (!business) return res.status(404).json({ error: 'Toko tidak ditemukan.' });
  const products = db.readCollection('products').filter((p) => p.businessId === business.id && p.stock > 0);
  res.json({
    business: { name: business.name, category: business.category, description: business.description, address: business.address, logoUrl: business.logoUrl },
    products,
    linkBagikan: `/toko/${business.catalogSlug}`,
  });
});

router.use(requireAuth);

router.get('/katalog/saya/link', requireBusiness, (req, res) => {
  res.json({ slug: req.business.catalogSlug, path: `/toko/${req.business.catalogSlug}` });
});

/* ============ 7. LOGISTIK KOLEKTIF DESA ============ */
router.post('/logistik/permintaan', requireBusiness, (req, res) => {
  const { orderId, pickupAddress, destAddress, courierType, recipientName, recipientPhone, note } = req.body;
  if (!destAddress) return res.status(400).json({ error: 'Alamat tujuan wajib diisi.' });
  const request = db.insert('logistics', {
    id: db.genId('log'), businessId: req.business.id, orderId: orderId || null,
    pickupAddress: pickupAddress || req.business.address, destAddress,
    recipientName: recipientName || '', recipientPhone: recipientPhone || '',
    courierType: courierType || 'ojek_desa', status: 'menunggu_kurir', note: note || '',
    createdAt: new Date().toISOString(),
  });
  res.json({ request, info: 'Permintaan dikirim ke pool ojek desa/kurir lokal terdekat untuk menghemat ongkos kirim.' });
});

router.get('/logistik/riwayat', requireBusiness, (req, res) => {
  const items = db.readCollection('logistics').filter((l) => l.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

router.put('/logistik/:id/status', requireBusiness, (req, res) => {
  const { status } = req.body; // menunggu_kurir | dijemput | dalam_perjalanan | selesai | dibatalkan
  const request = db.findById('logistics', req.params.id);
  if (!request || request.businessId !== req.business.id) return res.status(404).json({ error: 'Permintaan tidak ditemukan.' });
  res.json({ request: db.update('logistics', request.id, { status }) });
});

/* ============ 8. PASAR BERSAMA (MARKETPLACE DESA) ============ */
// PUBLIK - agar produk unggulan bisa diakses pembeli luar daerah tanpa login
router.get('/marketplace/produk-unggulan', (req, res) => {
  const businesses = db.readCollection('businesses').filter((b) => b.isActive);
  const products = db.readCollection('products').filter((p) => p.isFeatured && p.stock > 0);
  const items = products.map((p) => {
    const biz = businesses.find((b) => b.id === p.businessId);
    return { ...p, businessName: biz ? biz.name : 'UMKM', catalogSlug: biz ? biz.catalogSlug : null };
  }).filter((p) => p.catalogSlug);
  res.json({ items, total: items.length, kelurahan: 'Langkapura, Bandar Lampung' });
});

router.get('/marketplace/semua-usaha', (req, res) => {
  const { kategori } = req.query;
  let businesses = db.readCollection('businesses').filter((b) => b.isActive);
  if (kategori) businesses = businesses.filter((b) => b.category.toLowerCase() === String(kategori).toLowerCase());
  res.json({ items: businesses.map((b) => ({ name: b.name, category: b.category, description: b.description, catalogSlug: b.catalogSlug })) });
});

// Tandai produk sebagai unggulan agar tampil di Pasar Bersama (pemilik usaha sendiri)
router.put('/marketplace/produk/:id/unggulkan', requireBusiness, (req, res) => {
  const product = db.findById('products', req.params.id);
  if (!product || product.businessId !== req.business.id) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const updated = db.update('products', product.id, { isFeatured: !!req.body.isFeatured });
  res.json({ product: updated });
});

module.exports = router;
