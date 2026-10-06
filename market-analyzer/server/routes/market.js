/*
  Endpoints públicos de metadata de mercado (de momento, solo logos de
  criptomonedas). Sin requireAuth: tanto la app autenticada como la
  landing (vistas previas de producto) los necesitan, y no exponen nada
  sensible — son los mismos datos públicos que serviría CoinGecko.
*/
const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const rateLimit = require('../middleware/rateLimit');
const { resolveIcons, searchCoins } = require('../services/coinIcons');

const router = express.Router();

// 60 peticiones/min por IP: generoso para uso normal (una página pide
// como mucho un puñado de símbolos de una vez), suficiente para frenar
// un abuso que intente usar este endpoint para martillear CoinGecko.
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Demasiadas peticiones de iconos. Espera un momento.' }));

const MAX_SYMBOLS_PER_REQUEST = 40;

router.get('/icons', asyncHandler(async (req, res) => {
  const raw = String(req.query.symbols || '');
  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SYMBOLS_PER_REQUEST);
  if (!symbols.length) return res.json({ icons: {} });
  const icons = await resolveIcons(symbols);
  res.json({ icons });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '');
  const results = await searchCoins(q);
  res.json({ results });
}));

module.exports = router;
