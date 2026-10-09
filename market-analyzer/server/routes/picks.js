/*
  Antes "Handpicked Bets": server/services/picksJob.js le pedía a un LLM
  una lectura "genérica pero plausible" de BTC/ETH sin ningún dato de
  precio real detrás — inventaba una recomendación de la nada, justo lo
  que una auditoría de producto marcó como el problema más grave de
  Cryptolyzer. Ahora es un Market Scanner real: escanea en vivo los símbolos
  con datos de mercado reales usando el mismo motor determinista del AI
  Analyzer. Se mantiene la ruta /api/picks (no rompe nada que ya apunte
  aquí); el nombre de producto es "Market Scanner".
*/
const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { scanMarket } = require('../services/marketScanner');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { results, highlights } = await scanMarket();
  res.json({
    results,
    highlights,
    unavailable: results.length === 0,
    updatedAt: new Date().toISOString(),
  });
}));

module.exports = router;
