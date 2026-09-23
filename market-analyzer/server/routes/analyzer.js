const express = require('express');
const multer = require('multer');
const store = require('../store');
const { analyzeChart } = require('../services/claude');

// Límite diario de análisis por plan — Infinity para Pro (sin límite).
// Única fuente de verdad: tanto el gate de POST / como la cuota que lee
// el frontend en GET /history salen de aquí.
const PLAN_DAILY_LIMIT = { free: 3, plus: 15, pro: Infinity };
function dailyLimitFor(plan) {
  return PLAN_DAILY_LIMIT[plan] ?? PLAN_DAILY_LIMIT.free;
}

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB de sobra para una captura
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('El archivo debe ser una imagen.'));
    }
    cb(null, true);
  },
});

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Sube una imagen del gráfico.' });
  }
  const user = store.findUserById(req.session.userId);
  const limit = dailyLimitFor(user.plan);
  if (Number.isFinite(limit) && store.countAnalysesToday(user.id) >= limit) {
    return res.status(402).json({
      error: `Has usado tus ${limit} análisis de hoy.`,
      limitReached: true,
      plan: user.plan,
      limit,
    });
  }
  try {
    const symbolHint = (req.body.symbolHint || '').trim().slice(0, 20) || undefined;
    const timeframe = (req.body.timeframe || '').trim().slice(0, 10) || undefined;
    const analysis = await analyzeChart(req.file.buffer, req.file.mimetype, { symbolHint, timeframe });
    const record = store.addAnalysis({
      userId: req.session.userId,
      createdAt: new Date().toISOString(),
      timeframe: timeframe || null,
      ...analysis,
    });
    res.json({ analysis: record });
  } catch (err) {
    console.error('Error en el analizador:', err.message);
    res.status(502).json({ error: 'No se pudo completar el análisis. Inténtalo de nuevo en unos segundos.' });
  }
});

router.get('/history', (req, res) => {
  const user = store.findUserById(req.session.userId);
  const usedToday = store.countAnalysesToday(user.id);
  const limit = dailyLimitFor(user.plan);
  res.json({
    analyses: store.listAnalyses(req.session.userId),
    plan: user.plan,
    dailyLimit: Number.isFinite(limit) ? limit : null,
    remainingToday: Number.isFinite(limit) ? Math.max(0, limit - usedToday) : null,
  });
});

module.exports = router;
