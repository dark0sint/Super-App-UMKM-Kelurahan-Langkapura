const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth } = require('../lib/authMiddleware');

function getMyBusiness(req) {
  const user = db.findById('users', req.user.id);
  if (!user || !user.businessId) return null;
  return db.findById('businesses', user.businessId);
}

function requireBusiness(req, res, next) {
  const biz = getMyBusiness(req);
  if (!biz) return res.status(400).json({ error: 'Anda belum mendaftarkan usaha. Buat usaha terlebih dahulu di menu Profil Usaha.' });
  req.business = biz;
  next();
}

router.use(requireAuth);

/* ============ DAFTAR / EDIT USAHA ============ */
router.post('/usaha', (req, res) => {
  const { name, category, description, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nama usaha wajib diisi.' });
  const biz = db.insert('businesses', {
    id: db.genId('biz'),
    ownerId: req.user.id,
    name, category: category || 'Umum', description: description || '', address: address || '',
    logoUrl: '', qrisMerchantCode: db.genId('QRIS').toUpperCase(),
    catalogSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6),
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  db.update('users', req.user.id, { businessId: biz.id });
  res.json({ business: biz });
});

router.get('/usaha/saya', requireBusiness, (req, res) => res.json({ business: req.business }));

router.put('/usaha/saya', requireBusiness, (req, res) => {
  const { name, category, description, address, logoUrl } = req.body;
  const updated = db.update('businesses', req.business.id, {
    ...(name && { name }), ...(category && { category }), ...(description !== undefined && { description }),
    ...(address !== undefined && { address }), ...(logoUrl !== undefined && { logoUrl }),
  });
  res.json({ business: updated });
});

/* ============ 1. PENCATATAN KEUANGAN OTOMATIS ============ */
router.get('/keuangan/transaksi', requireBusiness, (req, res) => {
  const items = db.readCollection('transactions').filter((t) => t.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});

router.post('/keuangan/transaksi', requireBusiness, (req, res) => {
  const { type, category, amount, description, date } = req.body;
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Jenis transaksi harus income atau expense.' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Jumlah harus lebih dari 0.' });
  const trx = db.insert('transactions', {
    id: db.genId('trx'), businessId: req.business.id, type, category: category || 'Lainnya',
    amount: Number(amount), description: description || '', source: 'manual',
    date: date || new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  res.json({ transaction: trx });
});

router.delete('/keuangan/transaksi/:id', requireBusiness, (req, res) => {
  const trx = db.findById('transactions', req.params.id);
  if (!trx || trx.businessId !== req.business.id) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  db.remove('transactions', req.params.id);
  res.json({ ok: true });
});

// Laporan untung-rugi otomatis, tanpa perlu tahu rumus akuntansi
router.get('/keuangan/laporan', requireBusiness, (req, res) => {
  const { from, to } = req.query;
  let items = db.readCollection('transactions').filter((t) => t.businessId === req.business.id);
  if (from) items = items.filter((t) => new Date(t.date) >= new Date(from));
  if (to) items = items.filter((t) => new Date(t.date) <= new Date(to));

  const totalIncome = items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const laba = totalIncome - totalExpense;

  const byCategory = {};
  items.forEach((t) => {
    const key = `${t.type}:${t.category}`;
    byCategory[key] = (byCategory[key] || 0) + t.amount;
  });

  res.json({
    periode: { from: from || null, to: to || null },
    totalPemasukan: totalIncome,
    totalPengeluaran: totalExpense,
    labaRugi: laba,
    status: laba >= 0 ? 'UNTUNG' : 'RUGI',
    rincianPerKategori: byCategory,
    jumlahTransaksi: items.length,
  });
});

/* ============ 2. MANAJEMEN STOK SEDERHANA ============ */
router.get('/stok/produk', requireBusiness, (req, res) => {
  const items = db.readCollection('products').filter((p) => p.businessId === req.business.id);
  res.json({ items });
});

router.post('/stok/produk', requireBusiness, (req, res) => {
  const { name, sku, price, cost, stock, minStock, unit, imageUrl, category } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nama dan harga produk wajib diisi.' });
  const product = db.insert('products', {
    id: db.genId('prd'), businessId: req.business.id, name, sku: sku || '', price: Number(price),
    cost: Number(cost || 0), stock: Number(stock || 0), minStock: Number(minStock || 5),
    unit: unit || 'pcs', imageUrl: imageUrl || '', category: category || 'Umum',
    isFeatured: false, createdAt: new Date().toISOString(),
  });
  res.json({ product });
});

router.put('/stok/produk/:id', requireBusiness, (req, res) => {
  const product = db.findById('products', req.params.id);
  if (!product || product.businessId !== req.business.id) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const patch = {};
  ['name', 'sku', 'price', 'cost', 'minStock', 'unit', 'imageUrl', 'category', 'isFeatured'].forEach((f) => {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  });
  res.json({ product: db.update('products', req.params.id, patch) });
});

router.delete('/stok/produk/:id', requireBusiness, (req, res) => {
  const product = db.findById('products', req.params.id);
  if (!product || product.businessId !== req.business.id) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  db.remove('products', req.params.id);
  res.json({ ok: true });
});

// Tambah/kurang stok manual (mis. restock dari supplier)
router.post('/stok/produk/:id/movement', requireBusiness, (req, res) => {
  const product = db.findById('products', req.params.id);
  if (!product || product.businessId !== req.business.id) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const { type, qty, note } = req.body;
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'Jenis harus in atau out.' });
  const delta = type === 'in' ? Number(qty) : -Number(qty);
  const newStock = product.stock + delta;
  if (newStock < 0) return res.status(400).json({ error: 'Stok tidak boleh minus.' });

  db.update('products', product.id, { stock: newStock });
  db.insert('stock_movements', {
    id: db.genId('mov'), businessId: req.business.id, productId: product.id, productName: product.name,
    type, qty: Number(qty), note: note || '', date: new Date().toISOString(),
  });
  res.json({ product: db.findById('products', product.id) });
});

// Notifikasi otomatis: produk yang stoknya mulai menipis
router.get('/stok/notifikasi-menipis', requireBusiness, (req, res) => {
  const items = db.readCollection('products')
    .filter((p) => p.businessId === req.business.id && p.stock <= p.minStock);
  res.json({
    items,
    pesan: items.length
      ? `${items.length} produk stoknya menipis, segera lakukan restock.`
      : 'Semua stok produk masih aman.',
  });
});

router.get('/stok/riwayat', requireBusiness, (req, res) => {
  const items = db.readCollection('stock_movements').filter((m) => m.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});

/* ============ 3. KASIR DIGITAL (POS) ============ */
router.post('/kasir/transaksi', requireBusiness, (req, res) => {
  const { items, paymentMethod, customerName, cashReceived } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Keranjang belanja kosong.' });

  let total = 0;
  const detailedItems = [];
  for (const it of items) {
    const product = db.findById('products', it.productId);
    if (!product || product.businessId !== req.business.id) return res.status(404).json({ error: `Produk tidak ditemukan: ${it.productId}` });
    if (product.stock < it.qty) return res.status(400).json({ error: `Stok ${product.name} tidak cukup (sisa ${product.stock}).` });
    const subtotal = product.price * it.qty;
    total += subtotal;
    detailedItems.push({ productId: product.id, name: product.name, qty: it.qty, price: product.price, subtotal });
  }

  // Kurangi stok otomatis
  detailedItems.forEach((it) => {
    const product = db.findById('products', it.productId);
    db.update('products', it.productId, { stock: product.stock - it.qty });
    db.insert('stock_movements', {
      id: db.genId('mov'), businessId: req.business.id, productId: it.productId, productName: it.name,
      type: 'out', qty: it.qty, note: 'Penjualan kasir', date: new Date().toISOString(),
    });
  });

  const order = db.insert('orders', {
    id: db.genId('ord'), businessId: req.business.id, items: detailedItems, total,
    paymentMethod: paymentMethod || 'cash', customerName: customerName || 'Umum',
    cashReceived: cashReceived ? Number(cashReceived) : null,
    change: cashReceived ? Number(cashReceived) - total : null,
    status: 'paid', createdAt: new Date().toISOString(),
  });

  // Catat otomatis ke pembukuan (income) - inilah "pencatatan keuangan otomatis"
  db.insert('transactions', {
    id: db.genId('trx'), businessId: req.business.id, type: 'income', category: 'Penjualan Kasir',
    amount: total, description: `Transaksi kasir #${order.id.slice(-6)}`, source: 'pos', refId: order.id,
    date: order.createdAt, createdAt: order.createdAt,
  });

  res.json({ order, struk: buildReceiptText(req.business, order) });
});

function buildReceiptText(business, order) {
  const lines = [];
  lines.push(business.name.toUpperCase());
  if (business.address) lines.push(business.address);
  lines.push('--------------------------------');
  lines.push(new Date(order.createdAt).toLocaleString('id-ID'));
  lines.push('--------------------------------');
  order.items.forEach((it) => {
    lines.push(`${it.name} x${it.qty}`);
    lines.push(`  @${it.price.toLocaleString('id-ID')} = ${it.subtotal.toLocaleString('id-ID')}`);
  });
  lines.push('--------------------------------');
  lines.push(`TOTAL: Rp ${order.total.toLocaleString('id-ID')}`);
  if (order.paymentMethod === 'cash' && order.cashReceived != null) {
    lines.push(`Tunai: Rp ${order.cashReceived.toLocaleString('id-ID')}`);
    lines.push(`Kembali: Rp ${order.change.toLocaleString('id-ID')}`);
  } else {
    lines.push(`Metode: ${order.paymentMethod.toUpperCase()}`);
  }
  lines.push('--------------------------------');
  lines.push('Terima kasih sudah berbelanja!');
  lines.push('UMKM Kelurahan Langkapura');
  return lines.join('\n');
}

router.get('/kasir/transaksi', requireBusiness, (req, res) => {
  const items = db.readCollection('orders').filter((o) => o.businessId === req.business.id);
  res.json({ items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

router.get('/kasir/struk/:orderId', requireBusiness, (req, res) => {
  const order = db.findById('orders', req.params.orderId);
  if (!order || order.businessId !== req.business.id) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  res.json({ struk: buildReceiptText(req.business, order), order });
});

// Endpoint dukungan cetak struk fisik via Bluetooth (Web Bluetooth API dijalankan di sisi frontend,
// endpoint ini hanya menyediakan teks struk yang sudah diformat siap-cetak untuk printer thermal 58/80mm).
router.get('/kasir/struk/:orderId/print-payload', requireBusiness, (req, res) => {
  const order = db.findById('orders', req.params.orderId);
  if (!order || order.businessId !== req.business.id) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  res.json({ text: buildReceiptText(req.business, order) + '\n\n\n\n' });
});

module.exports = router;
module.exports.getMyBusiness = getMyBusiness;
module.exports.requireBusiness = requireBusiness;
