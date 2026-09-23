# 🏪 Super App UMKM Kelurahan Langkapura

Aplikasi web (backend API + frontend PWA) untuk mendampingi pelaku UMKM di
Kelurahan Langkapura, Kota Bandar Lampung. Dibangun dengan Node.js + Express
di backend dan HTML/CSS/JavaScript murni (tanpa proses build) di frontend,
sehingga ringan dan mudah dijalankan di server dengan spesifikasi terbatas.

## ✨ Daftar Fitur

**📦 Pengelolaan Usaha**
- Pencatatan keuangan otomatis (laba-rugi dihitung sistem, tanpa rumus akuntansi)
- Manajemen stok + notifikasi otomatis saat stok menipis
- Kasir digital (POS) dengan struk digital & dukungan cetak struk fisik via Bluetooth

**💰 Pembayaran & Permodalan**
- QRIS Desa (generate kode QR merchant & QR nominal, siap dihubungkan ke PJSP resmi)
- Kemitraan BUMDes/LPD: pengajuan modal usaha & panel review untuk petugas BUMDes

**🚚 Pemasaran & Logistik**
- Katalog produk digital (tautan toko online mini, bisa dibagikan ke WhatsApp)
- Logistik kolektif desa (permintaan pengiriman via ojek desa/kurir lokal)
- Pasar Bersama (marketplace desa) menampilkan produk unggulan seluruh UMKM

**💡 Pendampingan & Edukasi**
- Panduan mandiri perizinan: NIB, Sertifikasi Halal, P-IRT (dengan pelacak progres)
- Pojok Belajar UMKM (artikel & video tips ringan, hemat kuota)

**🛠️ Teknis**
- Mode offline (PWA + IndexedDB): input transaksi/stok tetap jalan tanpa sinyal,
  otomatis sinkron saat online kembali
- Login tanpa password: cukup nomor WhatsApp + kode OTP

---

## 🚀 Instalasi & Menjalankan di Server

### Prasyarat
- Node.js versi 18 ke atas (`node -v` untuk cek)
- Akses internet di server saat instalasi pertama kali (untuk `npm install`)

### Langkah-langkah

```bash
# 1. Ekstrak/upload folder ini ke server, lalu masuk ke foldernya
cd umkm-langkapura

# 2. Install dependency
npm install

# 3. Salin file environment lalu sesuaikan
cp .env.example .env
nano .env   # isi JWT_SECRET dengan string acak yang panjang & rahasia

# 4. Isi data awal (akun admin kelurahan/BUMDes + konten belajar)
npm run seed

# 5. Jalankan aplikasi
npm start
```

Aplikasi akan berjalan di `http://localhost:3000` (atau sesuai `PORT` di `.env`).

### Menjalankan permanen dengan PM2 (disarankan untuk produksi)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # ikuti instruksi yang muncul agar auto-start saat server reboot
```

### Mengakses dari internet (opsional, disarankan)

Gunakan **Nginx** sebagai reverse proxy + **HTTPS gratis** dari Let's Encrypt,
supaya aplikasi bisa dibuka lewat domain (mis. `umkm.langkapura.id`) dan fitur
PWA/offline berfungsi optimal (Service Worker mensyaratkan HTTPS, kecuali di
`localhost`). Contoh konfigurasi Nginx dasar:

```nginx
server {
    listen 80;
    server_name umkm.langkapura.id;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Lalu aktifkan HTTPS: `sudo certbot --nginx -d umkm.langkapura.id`

---

## 🔑 Login Demo (setelah `npm run seed`)

| Peran | Nomor WhatsApp | Catatan |
|---|---|---|
| Admin Kelurahan | 081200000000 | Bisa meninjau pengajuan pembiayaan |
| Petugas BUMDes | 081200000001 | Bisa menyetujui/menolak pengajuan modal |
| UMKM (baru) | nomor WA bebas | Otomatis terdaftar saat verifikasi OTP pertama |

Selama `NODE_ENV` **bukan** `production`, kode OTP akan ikut ditampilkan di
respons API (`devCode`) supaya mudah dites tanpa gateway WhatsApp sungguhan.
Saat `NODE_ENV=production`, kode OTP hanya tampil di log server (lihat
`lib/whatsapp.js`) — sambungkan ke gateway resmi (Fonnte/Wablas/WhatsApp
Business API) di file tersebut agar OTP benar-benar terkirim ke HP pengguna.

---

## 🧩 Integrasi Lanjutan yang Perlu Dilengkapi Sebelum Produksi Penuh

Beberapa fitur dibuat dengan **arsitektur siap-integrasi** namun memerlukan
kredensial pihak ketiga resmi yang hanya bisa didaftarkan oleh pengelola
aplikasi (bukan bagian dari kode open-source ini):

1. **Gateway WhatsApp OTP** — lengkapi `lib/whatsapp.js` dengan API key dari
   penyedia seperti Fonnte/Wablas agar OTP terkirim otomatis.
2. **QRIS resmi** — kode QR saat ini adalah representasi merchant untuk alur
   internal aplikasi. Agar bisa dipindai semua e-wallet/bank sesuai standar
   Bank Indonesia, daftarkan sebagai merchant lewat PJSP tersertifikasi
   (mis. Xendit, Midtrans, atau bank penyalur BUMDes), lalu ganti payload QR
   di `routes/pembayaran.js` dengan payload EMVCo resmi dari API tersebut.
3. **Cetak Bluetooth** — menggunakan Web Bluetooth API (perlu Chrome/Edge di
   Android; iOS Safari belum mendukung). UUID service/characteristic di
   `public/app.js` (`cetakBluetooth`) mungkin perlu disesuaikan dengan merk
   printer thermal yang dipakai di lapangan.

## 🗄️ Tentang Penyimpanan Data

Untuk kemudahan instalasi di server desa/kelurahan (tanpa perlu database
server terpisah), data disimpan sebagai file JSON di folder `data/`. Ini
cukup andal untuk skala UMKM satu kelurahan. Jika jumlah UMKM & transaksi
sudah sangat besar, migrasikan ke PostgreSQL/MySQL dengan mengganti isi
`lib/db.js` — struktur pemanggilan di seluruh `routes/*.js` tidak perlu
diubah karena semua akses data terpusat lewat modul ini.

**Penting:** lakukan backup rutin folder `data/` (mis. `cp -r data/ backup-$(date +%F)/`
via cron harian) karena ini adalah satu-satunya tempat penyimpanan data.

## 📁 Struktur Proyek

```
umkm-langkapura/
├── server.js              # entry point Express
├── ecosystem.config.js    # konfigurasi PM2
├── lib/
│   ├── db.js               # engine penyimpanan JSON
│   ├── authMiddleware.js   # JWT & role guard
│   ├── whatsapp.js         # adapter pengiriman OTP
│   └── seed.js             # data awal
├── routes/
│   ├── auth.js              # login OTP WhatsApp
│   ├── operasional.js       # keuangan, stok, kasir/POS
│   ├── pembayaran.js        # QRIS, pembiayaan BUMDes
│   ├── pemasaran.js         # katalog, marketplace, logistik
│   └── edukasi.js           # perizinan, pojok belajar
├── public/                 # frontend PWA (SPA vanilla JS)
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   ├── sw.js               # service worker (mode offline)
│   └── manifest.json
└── data/                   # penyimpanan data (JSON, dibuat otomatis)
```
