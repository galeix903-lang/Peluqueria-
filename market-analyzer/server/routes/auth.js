const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const { issueAccessToken, generateRefreshToken, refreshTokenExpiry } = require('../services/tokens');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name,
    bio: user.bio || null, avatar: user.avatar || null,
    balance: user.balance, plan: user.plan,
  };
}

function validSignupBody(body) {
  const { email, password, name } = body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return 'Email y contraseña son obligatorios.';
  }
  if (name !== undefined && typeof name !== 'string') return 'Nombre no válido.';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  return null;
}

// ---------- Web: sesión de cookie (sin cambios de comportamiento) ----------

router.post('/signup', asyncHandler(async (req, res) => {
  const error = validSignupBody(req.body);
  if (error) return res.status(400).json({ error });
  const { email, password, name } = req.body;
  if (await store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await store.createUser({ email, passwordHash, name });
  if (!user) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }
  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  const user = email && await store.findUserByEmail(email);
  const ok = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
  res.json({ user: publicUser(user) });
}));

// Usado por el modal de ajustes del header: nombre, bio y foto de perfil.
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const patch = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
    if (name.length > 60) return res.status(400).json({ error: 'El nombre es demasiado largo.' });
    patch.name = name;
  }
  if (req.body?.bio !== undefined) {
    const bio = String(req.body.bio).trim();
    if (bio.length > 160) return res.status(400).json({ error: 'La descripción no puede superar los 160 caracteres.' });
    patch.bio = bio || null;
  }
  if (req.body?.avatar !== undefined) {
    const avatar = req.body.avatar;
    if (avatar !== null) {
      if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
        return res.status(400).json({ error: 'La imagen de perfil no es válida.' });
      }
      if (avatar.length > 400_000) {
        return res.status(400).json({ error: 'La imagen es demasiado grande.' });
      }
    }
    patch.avatar = avatar;
  }

  const user = await store.updateUserProfile(req.userId, patch);
  res.json({ user: publicUser(user) });
}));

// ---------- App móvil: access token (JWT) + refresh token ----------
// Misma cuenta, mismas contraseñas — solo cambia cómo se prueba la
// identidad en cada petición (no hay navegador que guarde una cookie).

async function issueTokenPair(user, userAgent) {
  const accessToken = issueAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  await store.createRefreshToken({
    userId: user.id, token: refreshToken, expiresAt: refreshTokenExpiry(), userAgent,
  });
  return { accessToken, refreshToken };
}

router.post('/mobile/signup', asyncHandler(async (req, res) => {
  const error = validSignupBody(req.body);
  if (error) return res.status(400).json({ error });
  const { email, password, name } = req.body;
  if (await store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await store.createUser({ email, passwordHash, name });
  if (!user) return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  const tokens = await issueTokenPair(user, req.headers['user-agent']);
  res.status(201).json({ user: publicUser(user), ...tokens });
}));

router.post('/mobile/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  const user = email && await store.findUserByEmail(email);
  const ok = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  const tokens = await issueTokenPair(user, req.headers['user-agent']);
  res.json({ user: publicUser(user), ...tokens });
}));

router.post('/mobile/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ error: 'Falta el refresh token.' });
  }
  const record = await store.findValidRefreshToken(refreshToken);
  if (!record) return res.status(401).json({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' });

  // Rotación: el refresh token usado se revoca y se emite uno nuevo, así
  // que si alguien copia un refresh token antiguo (ej. de un backup),
  // usarlo una vez ya lo invalida en vez de quedar reutilizable para siempre.
  await store.revokeRefreshToken(refreshToken);
  const user = await store.findUserById(record.user_id);
  if (!user) return res.status(401).json({ error: 'Cuenta no encontrada.' });
  const tokens = await issueTokenPair(user, req.headers['user-agent']);
  res.json({ user: publicUser(user), ...tokens });
}));

router.post('/mobile/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken === 'string' && refreshToken) {
    await store.revokeRefreshToken(refreshToken);
  }
  res.json({ ok: true });
}));

module.exports = router;
