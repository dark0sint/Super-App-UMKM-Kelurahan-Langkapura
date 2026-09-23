// Konfigurasi PM2 - process manager agar aplikasi tetap hidup, auto-restart jika crash,
// dan otomatis jalan lagi setelah server reboot.
// Cara pakai di server: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'umkm-langkapura',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
