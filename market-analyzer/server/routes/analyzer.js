const express = require('express');
const multer = require('multer');
const store = require('../store');
const { analyzeChart } = require('../services/claude');

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
  try {
    const analysis = await analyzeChart(req.file.buffer, req.file.mimetype);
    const record = store.addAnalysis({
      userId: req.session.userId,
      createdAt: new Date().toISOString(),
      ...analysis,
    });
    res.json({ analysis: record });
  } catch (err) {
    console.error('Error en el analizador:', err.message);
    res.status(502).json({ error: 'No se pudo completar el análisis. Inténtalo de nuevo en unos segundos.' });
  }
});

router.get('/history', (req, res) => {
  res.json({ analyses: store.listAnalyses(req.session.userId) });
});

module.exports = router;
