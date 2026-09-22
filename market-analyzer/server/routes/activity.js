const express = require('express');
const store = require('../store');

const router = express.Router();

// Pública y sin sesión: alimenta el aviso de "actividad reciente" de la
// landing. Solo devuelve tipo de evento + símbolo + fecha (ver
// store.listRecentActivity) — nunca email, nombre ni importes.
router.get('/recent', (req, res) => {
  res.json({ events: store.listRecentActivity(12) });
});

module.exports = router;
