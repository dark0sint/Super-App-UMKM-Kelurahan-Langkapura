/* ==========================================================================
   SUPER APP UMKM KELURAHAN LANGKAPURA - Frontend (vanilla JS, tanpa build step)
   ========================================================================== */

const API = '/api';
const state = {
  token: localStorage.getItem('umkm_token') || null,
  user: JSON.parse(localStorage.getItem('umkm_user') || 'null'),
  business: null,
  route: location.hash.replace('#', '') || '/dashboard',
  cart: [],
};

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtDate = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ============================== OFFLINE QUEUE (IndexedDB) ==============================
   Setiap request POST/PUT/DELETE yang gagal karena tidak ada koneksi akan disimpan di
   IndexedDB, lalu otomatis dikirim ulang saat perangkat kembali online. Ini yang membuat
   kasir & pencatatan stok tetap bisa dipakai walau sinyal hilang di area kelurahan. */
const IDB_NAME = 'umkm_langkapura_offline';
let idbPromise = null;
function openIDB() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const dbi = req.result;
      if (!dbi.objectStoreNames.contains('outbox')) {
        dbi.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}
async function queueOfflineRequest(path, method, body) {
  const dbi = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = dbi.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').add({ path, method, body, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getOutboxAll() {
  const dbi = await openIDB();
  return new Promise((resolve) => {
    const tx = dbi.transaction('outbox', 'readonly');
    const req = tx.objectStore('outbox').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}
async function removeFromOutbox(id) {
  const dbi = await openIDB();
  return new Promise((resolve) => {
    const tx = dbi.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').delete(id);
    tx.oncomplete = () => resolve();
  });
}
async function flushOutbox() {
  const items = await getOutboxAll();
  if (!items.length) return;
  let success = 0;
  for (const item of items) {
    try {
      const res = await rawFetch(item.path, item.method, item.body);
      if (res && !res.__networkError) {
        await removeFromOutbox(item.id);
        success++;
      } else {
        break; // masih offline, hentikan, coba lagi nanti
      }
    } catch (e) {
      break;
    }
  }
  if (success > 0) {
    toast(`✅ ${success} data tersimpan berhasil disinkronkan.`);
    render();
  }
}
window.addEventListener('online', () => { updateOnlineBadge(); flushOutbox(); });
window.addEventListener('offline', updateOnlineBadge);

function updateOnlineBadge() {
  const pill = document.getElementById('offline-pill');
  if (pill) pill.style.display = navigator.onLine ? 'none' : 'inline-block';
}

/* ============================== API WRAPPER ============================== */
async function rawFetch(path, method = 'GET', body) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { __error: true, status: res.status, ...data };
    return data;
  } catch (e) {
    return { __networkError: true };
  }
}

async function api(path, method = 'GET', body, opts = {}) {
  const result = await rawFetch(path, method, body);
  if (result.__networkError) {
    if (method !== 'GET' && opts.queueIfOffline) {
      await queueOfflineRequest(path, method, body);
      toast('📴 Sedang offline. Data disimpan & akan disinkron otomatis nanti.');
      return { __queued: true };
    }
    toast('❌ Tidak ada koneksi internet.');
    return { __error: true, error: 'Tidak ada koneksi internet.' };
  }
  if (result.__error) {
    toast('⚠️ ' + (result.error || 'Terjadi kesalahan.'));
    return result;
  }
  return result;
}

/* ============================== AUTH ============================== */
function saveSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('umkm_token', token);
  localStorage.setItem('umkm_user', JSON.stringify(user));
}
function logout() {
  localStorage.removeItem('umkm_token'); localStorage.removeItem('umkm_user');
  state.token = null; state.user = null; state.business = null;
  navigate('/dashboard');
}

async function loadMyBusiness() {
  if (!state.token || state.user?.role !== 'umkm') return;
  const res = await api('/operasional/usaha/saya');
  if (!res.__error) state.business = res.business;
  else state.business = null;
}

/* ============================== ROUTER ============================== */
function navigate(route) {
  location.hash = route;
}
window.addEventListener('hashchange', () => {
  state.route = location.hash.replace('#', '') || '/dashboard';
  render();
});

const NAV_ITEMS = [
  { route: '/dashboard', icon: '🏠', label: 'Beranda' },
  { route: '/kasir', icon: '🧾', label: 'Kasir' },
  { route: '/keuangan', icon: '💰', label: 'Keuangan' },
  { route: '/stok', icon: '📦', label: 'Stok' },
  { route: '/lainnya', icon: '⋯', label: 'Lainnya' },
];

/* ============================== ROOT RENDER ============================== */
async function render() {
  const app = document.getElementById('app');

  // Halaman toko publik (tanpa login): /toko/:slug via pathname asli, bukan hash
  const pathMatch = location.pathname.match(/^\/toko\/([^/]+)/);
  if (pathMatch) return renderPublicStore(app, pathMatch[1]);

  if (!state.token) return renderLogin(app);

  if (state.user?.role === 'umkm' && !state.business && state.route !== '/buat-usaha') {
    await loadMyBusiness();
    if (!state.business) return renderBuatUsaha(app);
  }

  app.innerHTML = `
    <div class="topbar">
      <div>
        <h1>UMKM Langkapura</h1>
        <div class="sub">${state.business ? state.business.name : (state.user?.role === 'admin' ? 'Admin Kelurahan' : state.user?.role === 'bumdes' ? 'Petugas BUMDes' : '')}</div>
      </div>
      <div class="row">
        <span id="offline-pill" class="offline-pill" style="display:none;">OFFLINE</span>
      </div>
    </div>
    <main id="main"></main>
    ${state.user?.role === 'umkm' ? renderBottomNav() : ''}
  `;
  updateOnlineBadge();

  const main = document.getElementById('main');
  const route = state.route;

  if (state.user?.role === 'admin' || state.user?.role === 'bumdes') {
    return renderAdminPanel(main);
  }

  if (route === '/buat-usaha') return renderBuatUsaha(main);
  if (route.startsWith('/dashboard')) return renderDashboard(main);
  if (route.startsWith('/kasir')) return renderKasir(main);
  if (route.startsWith('/keuangan')) return renderKeuangan(main);
  if (route.startsWith('/stok')) return renderStok(main);
  if (route.startsWith('/qris')) return renderQris(main);
  if (route.startsWith('/pembiayaan')) return renderPembiayaan(main);
  if (route.startsWith('/katalog')) return renderKatalog(main);
  if (route.startsWith('/logistik')) return renderLogistik(main);
  if (route.startsWith('/marketplace')) return renderMarketplace(main);
  if (route.startsWith('/perizinan')) return renderPerizinan(main);
  if (route.startsWith('/belajar')) return renderBelajar(main);
  if (route.startsWith('/profil')) return renderProfil(main);
  if (route.startsWith('/lainnya')) return renderLainnya(main);
  return renderDashboard(main);
}

function renderBottomNav() {
  return `<div class="bottom-nav">
    ${NAV_ITEMS.map((n) => `
      <button class="${state.route.startsWith(n.route) ? 'active' : ''}" onclick="navigate('${n.route}')">
        <span class="icon">${n.icon}</span>${n.label}
      </button>`).join('')}
  </div>`;
}

/* ============================== LOGIN (OTP WhatsApp - tanpa password) ============================== */
function renderLogin(app) {
  app.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo-emoji">🏪</div>
      <h2 style="text-align:center;">Super App UMKM<br>Kelurahan Langkapura</h2>
      <p class="muted" style="text-align:center;">Login tanpa ribet, cukup nomor WhatsApp Anda</p>
      <div id="login-step-1">
        <label>Nomor WhatsApp</label>
        <input id="wa-input" placeholder="08xxxxxxxxxx" inputmode="numeric">
        <button class="btn" style="width:100%;margin-top:14px;" onclick="requestOtp()">Kirim Kode OTP</button>
      </div>
      <div id="login-step-2" style="display:none;">
        <p class="muted" id="otp-info"></p>
        <label>Nama Usaha/Anda (jika baru)</label>
        <input id="name-input" placeholder="Contoh: Warung Bu Sari">
        <label>Kode OTP (6 digit)</label>
        <input id="otp-input" placeholder="123456" inputmode="numeric" maxlength="6">
        <button class="btn" style="width:100%;margin-top:14px;" onclick="verifyOtp()">Masuk</button>
        <button class="btn secondary" style="width:100%;margin-top:8px;" onclick="document.getElementById('login-step-1').style.display='block';document.getElementById('login-step-2').style.display='none';">Ganti Nomor</button>
      </div>
    </div>
  </div>`;
}

async function requestOtp() {
  const wa = document.getElementById('wa-input').value.trim();
  if (!wa) return toast('Masukkan nomor WhatsApp.');
  const res = await api('/auth/otp/request', 'POST', { whatsapp: wa });
  if (res.__error) return;
  document.getElementById('login-step-1').style.display = 'none';
  document.getElementById('login-step-2').style.display = 'block';
  document.getElementById('otp-info').textContent = res.message + (res.devCode ? ` (Demo: ${res.devCode})` : '');
  window.__pendingWA = wa;
}
async function verifyOtp() {
  const code = document.getElementById('otp-input').value.trim();
  const name = document.getElementById('name-input').value.trim();
  const res = await api('/auth/otp/verify', 'POST', { whatsapp: window.__pendingWA, code, name });
  if (res.__error) return;
  saveSession(res.token, res.user);
  toast('Berhasil masuk!');
  navigate('/dashboard');
  render();
}

/* ============================== BUAT USAHA (onboarding) ============================== */
function renderBuatUsaha(app) {
  app.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <h2>Daftarkan Usaha Anda</h2>
      <p class="muted">Sebelum menggunakan fitur kasir, keuangan, dan lainnya, lengkapi profil usaha Anda dulu.</p>
      <label>Nama Usaha</label><input id="biz-name" placeholder="Contoh: Warung Bu Sari">
      <label>Kategori Usaha</label>
      <select id="biz-cat">
        <option>Kuliner</option><option>Kerajinan</option><option>Fashion/Pakaian</option>
        <option>Sembako/Kelontong</option><option>Jasa</option><option>Pertanian</option><option>Lainnya</option>
      </select>
      <label>Alamat Usaha</label><input id="biz-addr" placeholder="Jl. ... Kelurahan Langkapura">
      <label>Deskripsi Singkat</label><textarea id="biz-desc" rows="2" placeholder="Jual apa saja?"></textarea>
      <button class="btn" style="width:100%;margin-top:14px;" onclick="submitBuatUsaha()">Simpan & Mulai</button>
      <button class="btn secondary" style="width:100%;margin-top:8px;" onclick="logout()">Keluar</button>
    </div>
  </div>`;
}
async function submitBuatUsaha() {
  const name = document.getElementById('biz-name').value.trim();
  if (!name) return toast('Nama usaha wajib diisi.');
  const res = await api('/operasional/usaha', 'POST', {
    name, category: document.getElementById('biz-cat').value,
    address: document.getElementById('biz-addr').value, description: document.getElementById('biz-desc').value,
  });
  if (res.__error) return;
  state.business = res.business;
  toast('Usaha berhasil didaftarkan!');
  navigate('/dashboard'); render();
}

/* ============================== DASHBOARD ============================== */
async function renderDashboard(main) {
  main.innerHTML = `<div class="empty">Memuat dashboard...</div>`;
  const [laporan, notifStok] = await Promise.all([
    api('/operasional/keuangan/laporan'),
    api('/operasional/stok/notifikasi-menipis'),
  ]);
  main.innerHTML = `
    <div class="grid cols-2">
      <div class="stat-box"><div class="num">${fmtRp(laporan.totalPemasukan || 0)}</div><div class="lbl">Pemasukan</div></div>
      <div class="stat-box"><div class="num">${fmtRp(laporan.totalPengeluaran || 0)}</div><div class="lbl">Pengeluaran</div></div>
      <div class="stat-box" style="grid-column:span 2;">
        <div class="num" style="color:${(laporan.labaRugi || 0) >= 0 ? '#16a34a' : '#dc2626'}">${fmtRp(laporan.labaRugi || 0)}</div>
        <div class="lbl">${laporan.status === 'UNTUNG' ? '📈 Untung' : '📉 Rugi'} (semua waktu)</div>
      </div>
    </div>

    ${notifStok.items && notifStok.items.length ? `
    <div class="card" style="border-left:4px solid var(--orange);">
      <b>⚠️ Stok Menipis (${notifStok.items.length})</b>
      ${notifStok.items.slice(0, 4).map((p) => `<div class="list-item"><span>${p.name}</span><span class="badge orange">sisa ${p.stock} ${p.unit}</span></div>`).join('')}
      <button class="btn small secondary" style="margin-top:8px;" onclick="navigate('/stok')">Kelola Stok</button>
    </div>` : ''}

    <div class="section-title">Menu Cepat</div>
    <div class="grid cols-3">
      <div class="tile" onclick="navigate('/kasir')"><span class="emoji">🧾</span>Kasir</div>
      <div class="tile" onclick="navigate('/qris')"><span class="emoji">📲</span>QRIS</div>
      <div class="tile" onclick="navigate('/stok')"><span class="emoji">📦</span>Stok</div>
      <div class="tile" onclick="navigate('/katalog')"><span class="emoji">🛍️</span>Katalog</div>
      <div class="tile" onclick="navigate('/pembiayaan')"><span class="emoji">🏦</span>Modal Usaha</div>
      <div class="tile" onclick="navigate('/logistik')"><span class="emoji">🛵</span>Kirim Barang</div>
      <div class="tile" onclick="navigate('/marketplace')"><span class="emoji">🏪</span>Pasar Desa</div>
      <div class="tile" onclick="navigate('/perizinan')"><span class="emoji">📋</span>Perizinan</div>
      <div class="tile" onclick="navigate('/belajar')"><span class="emoji">🎓</span>Belajar</div>
    </div>
  `;
}

/* ============================== KASIR DIGITAL (POS) ============================== */
async function renderKasir(main) {
  const res = await api('/operasional/stok/produk');
  const products = res.items || [];
  main.innerHTML = `
    <div class="section-title">Kasir Digital</div>
    <div class="card">
      <input placeholder="Cari produk..." oninput="filterKasirProduk(this.value)">
      <div id="kasir-produk-list" class="grid cols-2" style="margin-top:10px;"></div>
    </div>
    <div class="card">
      <b>🛒 Keranjang</b>
      <div id="cart-list"></div>
      <div class="row between" style="margin-top:10px;font-weight:800;font-size:16px;">
        <span>Total</span><span id="cart-total">${fmtRp(0)}</span>
      </div>
      <label>Metode Pembayaran</label>
      <select id="payment-method">
        <option value="cash">Tunai</option>
        <option value="qris">QRIS</option>
      </select>
      <div id="cash-field">
        <label>Uang Diterima</label>
        <input id="cash-received" type="number" placeholder="0">
      </div>
      <button class="btn" style="width:100%;margin-top:12px;" onclick="prosesTransaksiKasir()">Proses Transaksi</button>
    </div>
    <div id="receipt-area"></div>
  `;
  window.__allProducts = products;
  renderKasirProdukList(products);
  document.getElementById('payment-method').addEventListener('change', (e) => {
    document.getElementById('cash-field').style.display = e.target.value === 'cash' ? 'block' : 'none';
  });
}
function renderKasirProdukList(products) {
  const el = document.getElementById('kasir-produk-list');
  if (!el) return;
  el.innerHTML = products.length ? products.map((p) => `
    <div class="product-card" onclick="tambahKeKeranjang('${p.id}')">
      <div style="font-weight:700;font-size:13px;">${p.name}</div>
      <div class="muted">${fmtRp(p.price)} · stok ${p.stock}</div>
    </div>`).join('') : `<div class="empty">Belum ada produk. Tambahkan di menu Stok.</div>`;
}
function filterKasirProduk(q) {
  const list = (window.__allProducts || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  renderKasirProdukList(list);
}
function tambahKeKeranjang(productId) {
  const product = (window.__allProducts || []).find((p) => p.id === productId);
  if (!product) return;
  const existing = state.cart.find((c) => c.productId === productId);
  if (existing) existing.qty += 1;
  else state.cart.push({ productId, name: product.name, price: product.price, qty: 1 });
  renderCart();
}
function ubahQtyCart(productId, delta) {
  const item = state.cart.find((c) => c.productId === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((c) => c.productId !== productId);
  renderCart();
}
function renderCart() {
  const el = document.getElementById('cart-list');
  if (!el) return;
  el.innerHTML = state.cart.length ? state.cart.map((c) => `
    <div class="cart-item">
      <span>${c.name}</span>
      <span class="row">
        <button class="btn small secondary" onclick="ubahQtyCart('${c.productId}',-1)">-</button>
        ${c.qty}
        <button class="btn small secondary" onclick="ubahQtyCart('${c.productId}',1)">+</button>
        <b>${fmtRp(c.price * c.qty)}</b>
      </span>
    </div>`).join('') : `<div class="empty">Keranjang kosong</div>`;
  const total = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
  document.getElementById('cart-total').textContent = fmtRp(total);
}
async function prosesTransaksiKasir() {
  if (!state.cart.length) return toast('Keranjang masih kosong.');
  const paymentMethod = document.getElementById('payment-method').value;
  const cashReceived = document.getElementById('cash-received').value;
  const res = await api('/operasional/kasir/transaksi', 'POST', {
    items: state.cart.map((c) => ({ productId: c.productId, qty: c.qty })),
    paymentMethod, cashReceived: cashReceived || undefined,
  }, { queueIfOffline: true });

  if (res.__queued) {
    document.getElementById('receipt-area').innerHTML = `<div class="card"><b>📴 Transaksi disimpan offline.</b><p class="muted">Struk akan tersedia & tersinkron otomatis ke pembukuan saat sinyal internet kembali.</p></div>`;
    state.cart = []; renderCart();
    return;
  }
  if (res.__error) return;

  state.cart = []; renderCart();
  toast('Transaksi berhasil!');
  document.getElementById('receipt-area').innerHTML = `
    <div class="card">
      <b>Struk Transaksi</b>
      <div class="receipt">${res.struk}</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn small" onclick="cetakBluetooth('${res.order.id}')">🖨️ Cetak via Bluetooth</button>
        <button class="btn small secondary" onclick="window.print()">🖨️ Cetak Biasa</button>
      </div>
    </div>`;
  const stokRes = await api('/operasional/stok/produk');
  window.__allProducts = stokRes.items || [];
  renderKasirProdukList(window.__allProducts);
}

// Cetak struk fisik via printer thermal Bluetooth (Web Bluetooth API, ESC/POS sederhana).
async function cetakBluetooth(orderId) {
  if (!navigator.bluetooth) {
    return toast('Perangkat/browser ini tidak mendukung Bluetooth Web. Gunakan Chrome Android atau cetak biasa.');
  }
  try {
    const printPayload = await api(`/operasional/kasir/struk/${orderId}/print-payload`);
    if (printPayload.__error) return;
    toast('Mencari printer Bluetooth di sekitar...');
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'], // service umum printer thermal
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    const encoder = new TextEncoder();
    const data = encoder.encode(printPayload.text);
    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
      await characteristic.writeValue(data.slice(i, i + chunkSize));
    }
    toast('✅ Struk terkirim ke printer.');
  } catch (e) {
    toast('Gagal cetak Bluetooth: ' + e.message + '. Model printer mungkin berbeda service UUID-nya.');
  }
}

/* ============================== KEUANGAN ============================== */
async function renderKeuangan(main) {
  main.innerHTML = `<div class="empty">Memuat...</div>`;
  const [laporan, trxRes] = await Promise.all([
    api('/operasional/keuangan/laporan'), api('/operasional/keuangan/transaksi'),
  ]);
  const trx = trxRes.items || [];
  main.innerHTML = `
    <div class="section-title">Pencatatan Keuangan Otomatis</div>
    <div class="card">
      <div class="grid cols-2">
        <div class="stat-box"><div class="num">${fmtRp(laporan.totalPemasukan)}</div><div class="lbl">Pemasukan</div></div>
        <div class="stat-box"><div class="num">${fmtRp(laporan.totalPengeluaran)}</div><div class="lbl">Pengeluaran</div></div>
      </div>
      <div class="stat-box" style="margin-top:10px;">
        <div class="num" style="color:${laporan.status === 'UNTUNG' ? '#16a34a' : '#dc2626'}">${fmtRp(laporan.labaRugi)}</div>
        <div class="lbl">${laporan.status === 'UNTUNG' ? 'Anda UNTUNG 🎉' : 'Anda RUGI, cek pengeluaran'} — dihitung otomatis, tanpa rumus akuntansi</div>
      </div>
    </div>

    <div class="card">
      <b>+ Catat Transaksi Manual</b>
      <label>Jenis</label>
      <select id="trx-type"><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select>
      <label>Kategori</label><input id="trx-cat" placeholder="Contoh: Belanja Bahan Baku">
      <label>Jumlah (Rp)</label><input id="trx-amount" type="number" placeholder="0">
      <label>Keterangan</label><input id="trx-desc" placeholder="Opsional">
      <button class="btn" style="width:100%;margin-top:10px;" onclick="tambahTransaksi()">Simpan</button>
    </div>

    <div class="section-title">Riwayat Transaksi</div>
    <div class="card">
      ${trx.length ? trx.map((t) => `
        <div class="list-item">
          <div>
            <div style="font-weight:600;">${t.category}</div>
            <div class="muted">${fmtDate(t.date)} ${t.source !== 'manual' ? `· <span class="badge gray">${t.source}</span>` : ''}</div>
          </div>
          <div class="row">
            <b style="color:${t.type === 'income' ? '#16a34a' : '#dc2626'}">${t.type === 'income' ? '+' : '-'}${fmtRp(t.amount)}</b>
            ${t.source === 'manual' ? `<button class="btn small danger" onclick="hapusTransaksi('${t.id}')">Hapus</button>` : ''}
          </div>
        </div>`).join('') : `<div class="empty">Belum ada transaksi.</div>`}
    </div>
  `;
}
async function tambahTransaksi() {
  const type = document.getElementById('trx-type').value;
  const category = document.getElementById('trx-cat').value;
  const amount = document.getElementById('trx-amount').value;
  const description = document.getElementById('trx-desc').value;
  if (!amount || amount <= 0) return toast('Jumlah wajib diisi.');
  const res = await api('/operasional/keuangan/transaksi', 'POST', { type, category, amount, description }, { queueIfOffline: true });
  if (res.__error) return;
  toast(res.__queued ? 'Disimpan offline, akan sinkron otomatis.' : 'Transaksi tersimpan.');
  renderKeuangan(document.getElementById('main'));
}
async function hapusTransaksi(id) {
  const res = await api(`/operasional/keuangan/transaksi/${id}`, 'DELETE', null, { queueIfOffline: true });
  if (res.__error) return;
  toast('Transaksi dihapus.');
  renderKeuangan(document.getElementById('main'));
}

/* ============================== STOK ============================== */
async function renderStok(main) {
  const res = await api('/operasional/stok/produk');
  const products = res.items || [];
  main.innerHTML = `
    <div class="section-title">Manajemen Stok</div>
    <div class="card">
      <b>+ Tambah Produk</b>
      <div class="grid cols-2">
        <div><label>Nama Produk</label><input id="p-name"></div>
        <div><label>Satuan</label><input id="p-unit" placeholder="pcs/kg/porsi" value="pcs"></div>
        <div><label>Harga Jual</label><input id="p-price" type="number"></div>
        <div><label>Modal (opsional)</label><input id="p-cost" type="number"></div>
        <div><label>Stok Awal</label><input id="p-stock" type="number" value="0"></div>
        <div><label>Stok Minimum</label><input id="p-minstock" type="number" value="5"></div>
      </div>
      <button class="btn" style="width:100%;margin-top:10px;" onclick="tambahProduk()">Simpan Produk</button>
    </div>

    <div class="section-title">Daftar Produk (${products.length})</div>
    ${products.length ? products.map((p) => `
      <div class="card">
        <div class="row between">
          <div>
            <b>${p.name}</b> ${p.stock <= p.minStock ? '<span class="badge orange">Stok Menipis</span>' : ''}
            <div class="muted">${fmtRp(p.price)} / ${p.unit} · Stok: ${p.stock}</div>
          </div>
          <label class="row" style="font-size:11px;"><input type="checkbox" style="width:auto;" ${p.isFeatured ? 'checked' : ''} onchange="toggleUnggulan('${p.id}', this.checked)"> Unggulkan</label>
        </div>
        <div class="row" style="margin-top:8px;">
          <input id="mov-qty-${p.id}" type="number" placeholder="Jumlah" style="flex:1;">
          <button class="btn small" onclick="movementStok('${p.id}','in')">+ Masuk</button>
          <button class="btn small secondary" onclick="movementStok('${p.id}','out')">- Keluar</button>
          <button class="btn small danger" onclick="hapusProduk('${p.id}')">Hapus</button>
        </div>
      </div>`).join('') : `<div class="empty">Belum ada produk.</div>`}
  `;
}
async function tambahProduk() {
  const name = document.getElementById('p-name').value.trim();
  const price = document.getElementById('p-price').value;
  if (!name || !price) return toast('Nama dan harga wajib diisi.');
  const res = await api('/operasional/stok/produk', 'POST', {
    name, price, cost: document.getElementById('p-cost').value,
    stock: document.getElementById('p-stock').value, minStock: document.getElementById('p-minstock').value,
    unit: document.getElementById('p-unit').value,
  }, { queueIfOffline: true });
  if (res.__error) return;
  toast(res.__queued ? 'Disimpan offline.' : 'Produk ditambahkan.');
  renderStok(document.getElementById('main'));
}
async function movementStok(id, type) {
  const qty = document.getElementById(`mov-qty-${id}`).value;
  if (!qty || qty <= 0) return toast('Isi jumlah dulu.');
  const res = await api(`/operasional/stok/produk/${id}/movement`, 'POST', { type, qty }, { queueIfOffline: true });
  if (res.__error) return;
  toast('Stok diperbarui.');
  renderStok(document.getElementById('main'));
}
async function hapusProduk(id) {
  const res = await api(`/operasional/stok/produk/${id}`, 'DELETE', null, { queueIfOffline: true });
  if (res.__error) return;
  renderStok(document.getElementById('main'));
}
async function toggleUnggulan(id, checked) {
  await api(`/pemasaran/marketplace/produk/${id}/unggulkan`, 'PUT', { isFeatured: checked });
  toast(checked ? 'Produk ditampilkan di Pasar Bersama.' : 'Produk disembunyikan dari Pasar Bersama.');
}

/* ============================== QRIS ============================== */
async function renderQris(main) {
  main.innerHTML = `<div class="empty">Memuat kode QRIS...</div>`;
  const res = await api('/pembayaran/qris/kode');
  if (res.__error) { main.innerHTML = `<div class="empty">Gagal memuat QRIS.</div>`; return; }
  const riwayat = await api('/pembayaran/qris/riwayat');
  main.innerHTML = `
    <div class="section-title">QRIS Desa</div>
    <div class="card" style="text-align:center;">
      <img src="${res.qrImage}" style="width:220px;height:220px;">
      <p class="muted">Kode Merchant: ${res.merchantCode}</p>
      <p class="muted" style="font-size:11px;">Tunjukkan QR ini untuk pembayaran nontunai. Untuk QRIS resmi yang bisa dipindai semua e-wallet/bank, hubungkan akun ke penyedia PJSP (lihat panduan integrasi).</p>
    </div>
    <div class="card">
      <b>Buat QR Nominal Tertentu</b>
      <label>Nominal (Rp)</label><input id="qris-amount" type="number" placeholder="0">
      <button class="btn" style="width:100%;margin-top:10px;" onclick="buatQrisNominal()">Buat QR</button>
      <div id="qris-nominal-area"></div>
    </div>
    <div class="section-title">Riwayat Pembayaran QRIS</div>
    <div class="card">
      ${(riwayat.items || []).length ? riwayat.items.map((p) => `
        <div class="list-item">
          <span>${fmtRp(p.amount)} ${p.note ? '· ' + p.note : ''}</span>
          <span class="badge ${p.status === 'paid' ? 'green' : 'orange'}">${p.status === 'paid' ? 'Lunas' : 'Menunggu'}</span>
        </div>`).join('') : `<div class="empty">Belum ada riwayat.</div>`}
    </div>
  `;
}
async function buatQrisNominal() {
  const amount = document.getElementById('qris-amount').value;
  if (!amount || amount <= 0) return toast('Isi nominal dulu.');
  const res = await api('/pembayaran/qris/kode-nominal', 'POST', { amount });
  if (res.__error) return;
  document.getElementById('qris-nominal-area').innerHTML = `
    <div style="text-align:center;margin-top:10px;">
      <img src="${res.qrImage}" style="width:200px;height:200px;">
      <p class="muted">Untuk demo tanpa PJSP:</p>
      <button class="btn small" onclick="simulasiBayarQris('${res.paymentId}')">Simulasikan Pembayaran Berhasil</button>
    </div>`;
}
async function simulasiBayarQris(id) {
  const res = await api(`/pembayaran/qris/simulasi-bayar/${id}`, 'POST');
  if (res.__error) return;
  toast('Pembayaran QRIS berhasil & tercatat otomatis ke pembukuan!');
  renderQris(document.getElementById('main'));
}

/* ============================== PEMBIAYAAN (BUMDes/LPD) ============================== */
async function renderPembiayaan(main) {
  const res = await api('/pembayaran/pembiayaan/riwayat');
  const loans = res.items || [];
  main.innerHTML = `
    <div class="section-title">Kemitraan BUMDes & LPD</div>
    <div class="card">
      <b>Ajukan Modal Usaha / Pembiayaan Mikro</b>
      <label>Jumlah Pengajuan (Rp)</label><input id="loan-amount" type="number">
      <label>Tujuan Penggunaan Dana</label><textarea id="loan-purpose" rows="2" placeholder="Contoh: tambah modal belanja bahan baku"></textarea>
      <label>Tenor (bulan)</label><input id="loan-tenor" type="number" value="6">
      <button class="btn" style="width:100%;margin-top:10px;" onclick="ajukanPembiayaan()">Ajukan Sekarang</button>
    </div>
    <div class="section-title">Riwayat Pengajuan</div>
    ${loans.length ? loans.map((l) => `
      <div class="card">
        <div class="row between">
          <b>${fmtRp(l.amount)}</b>
          <span class="badge ${l.status === 'approved' || l.status === 'disbursed' ? 'green' : l.status === 'rejected' ? 'red' : 'orange'}">${labelStatusLoan(l.status)}</span>
        </div>
        <div class="muted">${l.purpose}</div>
        <div class="muted">Tenor ${l.tenorBulan} bulan · Diajukan ${fmtDate(l.createdAt)}</div>
        ${l.bumdesNote ? `<div class="muted">Catatan BUMDes: ${l.bumdesNote}</div>` : ''}
      </div>`).join('') : `<div class="empty">Belum ada pengajuan.</div>`}
  `;
}
function labelStatusLoan(s) {
  return { pending: 'Menunggu Review', approved: 'Disetujui', rejected: 'Ditolak', disbursed: 'Dana Cair' }[s] || s;
}
async function ajukanPembiayaan() {
  const amount = document.getElementById('loan-amount').value;
  const purpose = document.getElementById('loan-purpose').value;
  const tenorBulan = document.getElementById('loan-tenor').value;
  if (!amount || !purpose) return toast('Lengkapi jumlah dan tujuan dana.');
  const res = await api('/pembayaran/pembiayaan/ajukan', 'POST', { amount, purpose, tenorBulan }, { queueIfOffline: true });
  if (res.__error) return;
  toast('Pengajuan terkirim ke BUMDes/LPD.');
  renderPembiayaan(document.getElementById('main'));
}

/* ============================== KATALOG DIGITAL ============================== */
async function renderKatalog(main) {
  const res = await api('/pemasaran/katalog/saya/link');
  const link = location.origin + (res.path || '');
  main.innerHTML = `
    <div class="section-title">Katalog Produk Digital</div>
    <div class="card" style="text-align:center;">
      <p>Ini toko online mini Anda. Bagikan tautan ini ke pelanggan lewat WhatsApp/Instagram:</p>
      <input readonly value="${link}" onclick="this.select()" style="text-align:center;font-weight:700;">
      <div class="row" style="margin-top:10px;justify-content:center;">
        <button class="btn small" onclick="navigator.clipboard.writeText('${link}');toast('Tautan disalin!')">📋 Salin Tautan</button>
        <a class="btn small secondary" href="https://wa.me/?text=${encodeURIComponent('Belanja produk UMKM kami di sini: ' + link)}" target="_blank">📤 Bagikan ke WhatsApp</a>
      </div>
      <a class="btn secondary" style="display:inline-block;margin-top:10px;" href="${res.path}" target="_blank">Lihat Toko Saya</a>
    </div>
    <p class="muted" style="text-align:center;">Tips: aktifkan checkbox "Unggulkan" pada produk (menu Stok) agar juga tampil di Pasar Bersama Kelurahan Langkapura.</p>
  `;
}

// Halaman toko publik (tanpa perlu login) - diakses lewat /toko/:slug
async function renderPublicStore(app, slug) {
  app.innerHTML = `<main style="max-width:520px;margin:0 auto;padding:16px;"><div class="empty">Memuat toko...</div></main>`;
  const res = await api(`/pemasaran/katalog/publik/${slug}`);
  const main = app.querySelector('main');
  if (res.__error) { main.innerHTML = `<div class="empty">Toko tidak ditemukan.</div>`; return; }
  main.innerHTML = `
    <div class="card" style="text-align:center;">
      <h2 style="margin:4px 0;">${res.business.name}</h2>
      <div class="badge green">${res.business.category}</div>
      <p class="muted">${res.business.description || ''}</p>
      <p class="muted">📍 ${res.business.address || '-'}</p>
    </div>
    <div class="section-title">Produk</div>
    <div class="grid cols-2">
      ${(res.products || []).length ? res.products.map((p) => `
        <div class="product-card">
          <div style="font-weight:700;font-size:13px;">${p.name}</div>
          <div class="muted">${fmtRp(p.price)}</div>
          <a class="btn small" style="width:100%;text-align:center;margin-top:6px;display:block;" href="https://wa.me/?text=${encodeURIComponent('Halo, saya mau pesan ' + p.name + ' dari ' + res.business.name)}" target="_blank">Pesan via WA</a>
        </div>`).join('') : `<div class="empty">Belum ada produk.</div>`}
    </div>
    <p class="muted" style="text-align:center;margin-top:20px;">Powered by Super App UMKM Kelurahan Langkapura</p>
  `;
}

/* ============================== LOGISTIK KOLEKTIF DESA ============================== */
async function renderLogistik(main) {
  const res = await api('/pemasaran/logistik/riwayat');
  const items = res.items || [];
  main.innerHTML = `
    <div class="section-title">Logistik Kolektif Desa</div>
    <div class="card">
      <b>+ Ajukan Pengiriman</b>
      <label>Alamat Tujuan</label><input id="log-dest" placeholder="Alamat penerima">
      <label>Nama Penerima</label><input id="log-recipient">
      <label>No. HP Penerima</label><input id="log-phone">
      <label>Jenis Kurir</label>
      <select id="log-courier"><option value="ojek_desa">Ojek Desa</option><option value="kurir_lokal">Kurir Lokal</option></select>
      <label>Catatan</label><input id="log-note" placeholder="Opsional">
      <button class="btn" style="width:100%;margin-top:10px;" onclick="ajukanLogistik()">Kirim Permintaan</button>
    </div>
    <div class="section-title">Riwayat Pengiriman</div>
    ${items.length ? items.map((l) => `
      <div class="card">
        <div class="row between">
          <b>${l.recipientName || 'Tanpa nama'}</b>
          <span class="badge ${l.status === 'selesai' ? 'green' : l.status === 'dibatalkan' ? 'red' : 'orange'}">${l.status.replace(/_/g, ' ')}</span>
        </div>
        <div class="muted">${l.destAddress}</div>
        <div class="muted">${l.courierType === 'ojek_desa' ? 'Ojek Desa' : 'Kurir Lokal'} · ${fmtDate(l.createdAt)}</div>
      </div>`).join('') : `<div class="empty">Belum ada permintaan pengiriman.</div>`}
  `;
}
async function ajukanLogistik() {
  const destAddress = document.getElementById('log-dest').value.trim();
  if (!destAddress) return toast('Isi alamat tujuan.');
  const res = await api('/pemasaran/logistik/permintaan', 'POST', {
    destAddress, recipientName: document.getElementById('log-recipient').value,
    recipientPhone: document.getElementById('log-phone').value, courierType: document.getElementById('log-courier').value,
    note: document.getElementById('log-note').value,
  }, { queueIfOffline: true });
  if (res.__error) return;
  toast('Permintaan pengiriman terkirim.');
  renderLogistik(document.getElementById('main'));
}

/* ============================== MARKETPLACE DESA (Pasar Bersama) ============================== */
async function renderMarketplace(main) {
  const res = await api('/pemasaran/marketplace/produk-unggulan');
  const items = res.items || [];
  main.innerHTML = `
    <div class="section-title">Pasar Bersama Kelurahan Langkapura</div>
    <p class="muted">Produk unggulan dari seluruh UMKM di kelurahan, bisa diakses pembeli luar daerah.</p>
    <div class="grid cols-2">
      ${items.length ? items.map((p) => `
        <div class="product-card">
          <div style="font-weight:700;font-size:13px;">${p.name}</div>
          <div class="muted">${p.businessName}</div>
          <div class="muted">${fmtRp(p.price)}</div>
          <a class="btn small" style="width:100%;text-align:center;margin-top:6px;display:block;" href="/toko/${p.catalogSlug}">Lihat Toko</a>
        </div>`).join('') : `<div class="empty">Belum ada produk unggulan. Tandai produk Anda sebagai "Unggulan" di menu Stok.</div>`}
    </div>
  `;
}

/* ============================== PERIZINAN (NIB, Halal, P-IRT) ============================== */
async function renderPerizinan(main) {
  const [panduanRes, progresRes] = await Promise.all([
    api('/edukasi/perizinan/panduan'), api('/edukasi/perizinan/progres'),
  ]);
  const panduan = panduanRes.items || {};
  const progresList = progresRes.items || [];
  main.innerHTML = `
    <div class="section-title">Konsultasi & Perizinan Mandiri</div>
    <div class="tabs">
      ${Object.keys(panduan).map((k, i) => `<button class="perizinan-tab ${i === 0 ? 'active' : ''}" data-jenis="${k}" onclick="switchPerizinanTab('${k}')">${panduan[k].nama.split('(')[0].trim()}</button>`).join('')}
    </div>
    <div id="perizinan-content"></div>
  `;
  window.__panduanData = panduan;
  window.__progresData = progresList;
  switchPerizinanTab(Object.keys(panduan)[0]);
}
async function switchPerizinanTab(jenis) {
  document.querySelectorAll('.perizinan-tab').forEach((b) => b.classList.toggle('active', b.dataset.jenis === jenis));
  const data = window.__panduanData[jenis];
  let progress = window.__progresData.find((p) => p.jenis === jenis);
  const completed = progress ? progress.completedSteps : [];
  document.getElementById('perizinan-content').innerHTML = `
    <div class="card">
      <b>${data.nama}</b>
      <p class="muted">${data.deskripsi}</p>
      <p class="muted">⏱️ Estimasi: ${data.estimasiWaktu}</p>
      ${!progress ? `<button class="btn small" onclick="mulaiPerizinan('${jenis}')">Mulai Lacak Progres</button>` : `<span class="badge ${progress.status === 'selesai' ? 'green' : 'orange'}">${progress.status === 'selesai' ? 'Selesai ✅' : 'Sedang Berjalan'}</span>`}
    </div>
    <div class="card">
      ${data.langkah.map((s) => `
        <div class="step-item">
          <div class="step-check ${completed.includes(s.step) ? 'done' : ''}" ${progress ? `onclick="toggleStepPerizinan('${progress.id}', ${s.step})"` : ''} style="cursor:${progress ? 'pointer' : 'default'};">${completed.includes(s.step) ? '✓' : s.step}</div>
          <div><b>${s.judul}</b><div class="muted">${s.detail}</div></div>
        </div>`).join('')}
    </div>
  `;
}
async function mulaiPerizinan(jenis) {
  const res = await api('/edukasi/perizinan/progres', 'POST', { jenis });
  if (res.__error) return;
  window.__progresData.push(res.progress);
  switchPerizinanTab(jenis);
}
async function toggleStepPerizinan(id, step) {
  const res = await api(`/edukasi/perizinan/progres/${id}/toggle-step`, 'PUT', { step });
  if (res.__error) return;
  window.__progresData = window.__progresData.map((p) => (p.id === id ? res.progress : p));
  switchPerizinanTab(res.progress.jenis);
}

/* ============================== POJOK BELAJAR UMKM ============================== */
async function renderBelajar(main) {
  const res = await api('/edukasi/belajar/konten');
  const items = res.items || [];
  main.innerHTML = `
    <div class="section-title">Pojok Belajar UMKM</div>
    <p class="muted">Tips & video singkat, hemat kuota internet.</p>
    ${items.length ? items.map((c) => `
      <div class="card">
        <div class="row between">
          <b>${c.type === 'video' ? '🎬' : '📄'} ${c.title}</b>
          <span class="badge gray">${c.sizeKb < 1024 ? c.sizeKb + ' KB' : (c.sizeKb / 1024).toFixed(1) + ' MB'}</span>
        </div>
        <p class="muted">${c.summary}</p>
        ${c.durationSec ? `<span class="muted">⏱️ ${c.durationSec} detik</span>` : ''}
      </div>`).join('') : `<div class="empty">Belum ada konten.</div>`}
  `;
}

/* ============================== PROFIL USAHA ============================== */
async function renderProfil(main) {
  const res = await api('/operasional/usaha/saya');
  const b = res.business || state.business || {};
  main.innerHTML = `
    <div class="section-title">Profil Usaha</div>
    <div class="card">
      <label>Nama Usaha</label><input id="pf-name" value="${b.name || ''}">
      <label>Kategori</label><input id="pf-cat" value="${b.category || ''}">
      <label>Alamat</label><input id="pf-addr" value="${b.address || ''}">
      <label>Deskripsi</label><textarea id="pf-desc" rows="2">${b.description || ''}</textarea>
      <button class="btn" style="width:100%;margin-top:10px;" onclick="simpanProfil()">Simpan Perubahan</button>
    </div>
    <div class="card">
      <b>Akun: ${state.user?.name}</b>
      <p class="muted">WhatsApp: ${state.user?.whatsapp}</p>
      <button class="btn danger" style="width:100%;" onclick="logout()">Keluar</button>
    </div>
  `;
}
async function simpanProfil() {
  const res = await api('/operasional/usaha/saya', 'PUT', {
    name: document.getElementById('pf-name').value, category: document.getElementById('pf-cat').value,
    address: document.getElementById('pf-addr').value, description: document.getElementById('pf-desc').value,
  });
  if (res.__error) return;
  state.business = res.business;
  toast('Profil usaha diperbarui.');
}

/* ============================== MENU LAINNYA (grid akses cepat semua fitur) ============================== */
function renderLainnya(main) {
  main.innerHTML = `
    <div class="section-title">Semua Fitur</div>
    <div class="grid cols-3">
      <div class="tile" onclick="navigate('/qris')"><span class="emoji">📲</span>QRIS</div>
      <div class="tile" onclick="navigate('/pembiayaan')"><span class="emoji">🏦</span>Modal Usaha</div>
      <div class="tile" onclick="navigate('/katalog')"><span class="emoji">🛍️</span>Katalog Saya</div>
      <div class="tile" onclick="navigate('/marketplace')"><span class="emoji">🏪</span>Pasar Desa</div>
      <div class="tile" onclick="navigate('/logistik')"><span class="emoji">🛵</span>Kirim Barang</div>
      <div class="tile" onclick="navigate('/perizinan')"><span class="emoji">📋</span>Perizinan</div>
      <div class="tile" onclick="navigate('/belajar')"><span class="emoji">🎓</span>Pojok Belajar</div>
      <div class="tile" onclick="navigate('/profil')"><span class="emoji">👤</span>Profil Usaha</div>
    </div>
  `;
}

/* ============================== PANEL ADMIN / BUMDES ============================== */
async function renderAdminPanel(main) {
  const res = await api('/pembayaran/pembiayaan/admin/semua');
  const loans = res.items || [];
  main.innerHTML = `
    <div class="section-title">Panel ${state.user.role === 'admin' ? 'Admin Kelurahan' : 'BUMDes'}</div>
    <p class="muted">Meninjau pengajuan modal usaha/pembiayaan mikro dari seluruh UMKM.</p>
    ${loans.length ? loans.map((l) => `
      <div class="card">
        <div class="row between">
          <b>${l.business ? l.business.name : 'Usaha tidak ditemukan'}</b>
          <span class="badge ${l.status === 'approved' || l.status === 'disbursed' ? 'green' : l.status === 'rejected' ? 'red' : 'orange'}">${labelStatusLoan(l.status)}</span>
        </div>
        <div class="muted">Jumlah: ${fmtRp(l.amount)} · Tenor ${l.tenorBulan} bulan</div>
        <div class="muted">Tujuan: ${l.purpose}</div>
        <div class="muted">${fmtDate(l.createdAt)}</div>
        ${l.status === 'pending' ? `
        <div class="row" style="margin-top:8px;">
          <button class="btn small" onclick="keputusanPinjaman('${l.id}','approved')">Setujui</button>
          <button class="btn small secondary" onclick="keputusanPinjaman('${l.id}','rejected')">Tolak</button>
        </div>` : l.status === 'approved' ? `
        <button class="btn small" style="margin-top:8px;" onclick="keputusanPinjaman('${l.id}','disbursed')">Tandai Dana Cair</button>
        ` : ''}
      </div>`).join('') : `<div class="empty">Belum ada pengajuan.</div>`}
    <button class="btn danger" style="width:100%;margin-top:10px;" onclick="logout()">Keluar</button>
  `;
}
async function keputusanPinjaman(id, status) {
  const res = await api(`/pembayaran/pembiayaan/admin/${id}/keputusan`, 'PUT', { status });
  if (res.__error) return;
  toast('Status pengajuan diperbarui.');
  renderAdminPanel(document.getElementById('main'));
}

/* ============================== INIT ============================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
render();
