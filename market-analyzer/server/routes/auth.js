const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');

const router = express.Router();

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, balance: user.balance, plan: user.plan };
}

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser({ email, passwordHash, name });
  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && store.findUserByEmail(email);
  const ok = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  const user = req.session.userId && store.findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
  res.json({ user: publicUser(user) });
});

// Usado por el modal de ajustes del header para editar el nombre mostrado.
router.patch('/me', (req, res) => {
  const existing = req.session.userId && store.findUserById(req.session.userId);
  if (!existing) return res.status(401).json({ error: 'No has iniciado sesión.' });
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
  if (name.length > 60) return res.status(400).json({ error: 'El nombre es demasiado largo.' });
  const user = store.updateUserName(existing.id, name);
  res.json({ user: publicUser(user) });
});

module.exports = router;
