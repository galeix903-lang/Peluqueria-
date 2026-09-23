const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name,
    bio: user.bio || null, avatar: user.avatar || null,
    balance: user.balance, plan: user.plan,
  };
}

router.post('/signup', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }
  if (name !== undefined && typeof name !== 'string') {
    return res.status(400).json({ error: 'Nombre no válido.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // Segunda comprobación, esta vez atómica (dentro de la misma función
  // síncrona que hace push+save): entre el check de arriba y este punto
  // hay un await de por medio, así que dos signups concurrentes con el
  // mismo email podrían haber pasado los dos la primera comprobación.
  // store.createUser vuelve a comprobar justo antes de guardar, sin
  // ningún await entre medias, así que solo uno de los dos puede ganar.
  const user = store.createUser({ email, passwordHash, name });
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
  const user = email && store.findUserByEmail(email);
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

router.get('/me', (req, res) => {
  const user = req.session.userId && store.findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
  res.json({ user: publicUser(user) });
});

// Usado por el modal de ajustes del header: nombre, bio y foto de perfil.
router.patch('/me', (req, res) => {
  const existing = req.session.userId && store.findUserById(req.session.userId);
  if (!existing) return res.status(401).json({ error: 'No has iniciado sesión.' });

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

  const user = store.updateUserProfile(existing.id, patch);
  res.json({ user: publicUser(user) });
});

module.exports = router;
