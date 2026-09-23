/**
 * Menjalankan: npm run seed
 * Mengisi data awal: akun admin kelurahan, konten Pojok Belajar, dan contoh usaha demo.
 */
const db = require('./db');

function seedIfEmpty(name, items) {
  const existing = db.readCollection(name);
  if (existing.length === 0) {
    db.writeCollection(name, items);
    console.log(`✔ Seed ${name}: ${items.length} data`);
  } else {
    console.log(`- Lewati ${name} (sudah ada data)`);
  }
}

// Admin kelurahan / operator BUMDes
seedIfEmpty('users', [
  {
    id: 'usr_admin_kelurahan',
    whatsapp: '6281200000000',
    name: 'Admin Kelurahan Langkapura',
    role: 'admin',
    businessId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_bumdes',
    whatsapp: '6281200000001',
    name: 'Petugas BUMDes Langkapura',
    role: 'bumdes',
    businessId: null,
    createdAt: new Date().toISOString(),
  },
]);

seedIfEmpty('learning_content', [
  {
    id: 'edu_1', title: 'Cara Menentukan Harga Jual Agar Tidak Rugi', type: 'article',
    durationSec: 0, sizeKb: 15, summary: 'Tips singkat menghitung modal + margin agar harga jual tetap kompetitif dan untung.',
    tags: ['keuangan', 'pemula'], url: '', createdAt: new Date().toISOString(),
  },
  {
    id: 'edu_2', title: 'Video: Foto Produk Pakai HP Biar Menarik', type: 'video',
    durationSec: 90, sizeKb: 8000, summary: 'Trik pencahayaan sederhana untuk foto produk jualan online, hemat kuota (kualitas rendah).',
    tags: ['pemasaran', 'foto'], url: '', createdAt: new Date().toISOString(),
  },
  {
    id: 'edu_3', title: 'Kenapa UMKM Perlu NIB?', type: 'article',
    durationSec: 0, sizeKb: 12, summary: 'Manfaat NIB untuk akses bantuan modal, pelatihan, dan kemudahan izin lain.',
    tags: ['perizinan'], url: '', createdAt: new Date().toISOString(),
  },
  {
    id: 'edu_4', title: 'Video: Tips Melayani Pelanggan Ramah', type: 'video',
    durationSec: 75, sizeKb: 6500, summary: 'Cara menyapa dan melayani pembeli agar mereka datang lagi.',
    tags: ['pemasaran', 'pemula'], url: '', createdAt: new Date().toISOString(),
  },
  {
    id: 'edu_5', title: 'Mengelola Stok Biar Tidak Kehabisan atau Menumpuk', type: 'article',
    durationSec: 0, sizeKb: 10, summary: 'Prinsip dasar FIFO dan menentukan stok minimum untuk usaha kecil.',
    tags: ['operasional'], url: '', createdAt: new Date().toISOString(),
  },
]);

seedIfEmpty('businesses', []);
seedIfEmpty('products', []);
seedIfEmpty('transactions', []);
seedIfEmpty('stock_movements', []);
seedIfEmpty('orders', []);
seedIfEmpty('qris_payments', []);
seedIfEmpty('loans', []);
seedIfEmpty('logistics', []);
seedIfEmpty('licensing_progress', []);
seedIfEmpty('otps', []);

console.log('\nSelesai. Login admin/BUMDes demo pakai OTP dengan nomor:');
console.log(' - Admin Kelurahan : 081200000000');
console.log(' - BUMDes          : 081200000001');
console.log('(mode development akan menampilkan kode OTP langsung di response API)\n');
