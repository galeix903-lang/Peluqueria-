const express = require('express');
const store = require('../store');
const asyncHandler = require('../middleware/asyncHandler');
const { sendPushToUser } = require('../services/pushNotifications');

const router = express.Router();

// Registra (o re-asocia, ver ON CONFLICT en store.js) el push token de
// este dispositivo con el usuario autenticado.
router.post('/register-token', asyncHandler(async (req, res) => {
  const token = (req.body?.token || '').trim();
  const platform = (req.body?.platform || '').trim().slice(0, 20) || null;
  if (!token) return res.status(400).json({ error: 'Falta el token de notificaciones.' });
  await store.registerPushToken({ userId: req.userId, token, platform });
  res.status(201).json({ ok: true });
}));

router.delete('/register-token', asyncHandler(async (req, res) => {
  const token = (req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Falta el token de notificaciones.' });
  await store.removePushToken(req.userId, token);
  res.json({ ok: true });
}));

// Autoprueba: el propio usuario se envía una notificación para
// comprobar que le llegan de verdad a su dispositivo.
router.post('/test', asyncHandler(async (req, res) => {
  const result = await sendPushToUser(req.userId, {
    title: 'Vantex.AI',
    body: 'Esto es una notificación de prueba. Si la ves, las notificaciones funcionan.',
    data: { type: 'test' },
  });
  if (result.sent === 0) {
    return res.status(502).json({ error: 'No se pudo enviar la notificación de prueba. Comprueba que tienes un dispositivo registrado.', detail: result.error });
  }
  res.json({ ok: true, sent: result.sent });
}));

module.exports = router;
