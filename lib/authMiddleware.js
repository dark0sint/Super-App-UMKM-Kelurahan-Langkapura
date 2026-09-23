const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_secret_jangan_dipakai_produksi';

function signToken(user) {
  return jwt.sign(
    { id: user.id, whatsapp: user.whatsapp, role: user.role, businessId: user.businessId || null },
    SECRET,
    { expiresIn: '30d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesi login tidak valid atau kadaluarsa, silakan login ulang.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses untuk fitur ini.' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, SECRET };
