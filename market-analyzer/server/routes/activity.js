const express = require('express');
const store = require('../store');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// Pública y sin sesión: alimenta el aviso de "actividad reciente" de la
// landing. Solo devuelve tipo de evento + símbolo + fecha (ver
// store.listRecentActivity) — nunca email, nombre ni importes.
router.get('/recent', asyncHandler(async (req, res) => {
  res.json({ events: await store.listRecentActivity(12) });
}));

// También pública: el contador real de cuentas creadas, para el sello de
// confianza de la landing (nunca una puntuación de estrellas inventada).
router.get('/stats', asyncHandler(async (req, res) => {
  res.json(await store.getStats());
}));

module.exports = router;
