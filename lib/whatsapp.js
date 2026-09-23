/**
 * Adapter pengiriman OTP via WhatsApp.
 * Mode default "console" hanya mencetak kode ke log server (untuk demo/tanpa biaya).
 * Untuk produksi, hubungkan ke gateway resmi (mis. Fonnte, Wablas, atau WhatsApp Business API)
 * dengan mengisi WA_GATEWAY_PROVIDER & WA_GATEWAY_API_KEY di .env lalu lengkapi fungsi sendOtp().
 */
async function sendOtp(whatsappNumber, code) {
  const provider = process.env.WA_GATEWAY_PROVIDER || 'console';

  if (provider === 'console') {
    console.log(`\n[OTP WHATSAPP] Kirim ke ${whatsappNumber}: Kode OTP Anda adalah ${code} (berlaku 5 menit)\n`);
    return { ok: true, provider: 'console' };
  }

  // Contoh integrasi Fonnte (aktifkan & sesuaikan bila sudah punya API key):
  // const resp = await fetch('https://api.fonnte.com/send', {
  //   method: 'POST',
  //   headers: { Authorization: process.env.WA_GATEWAY_API_KEY },
  //   body: new URLSearchParams({
  //     target: whatsappNumber,
  //     message: `Kode OTP Super App UMKM Langkapura Anda: ${code} (berlaku 5 menit, jangan bagikan ke siapapun)`
  //   })
  // });
  // return await resp.json();

  console.warn(`Provider WA "${provider}" belum diimplementasikan, fallback ke console.`);
  console.log(`[OTP WHATSAPP] Kirim ke ${whatsappNumber}: ${code}`);
  return { ok: true, provider: 'console-fallback' };
}

module.exports = { sendOtp };
