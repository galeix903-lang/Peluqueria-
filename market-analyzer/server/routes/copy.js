const express = require('express');
const store = require('../store');
const { TRADERS } = require('../services/copyTraders');
const { runCopyTradingTick } = require('../services/copyTradingJob');

const router = express.Router();

router.get('/', (req, res) => {
  const follows = store.listCopyFollows(req.session.userId);
  const followedIds = new Set(follows.map((f) => f.traderId));
  const traders = TRADERS.map((t) => ({
    ...t,
    followers: t.followersBase + Math.floor(Math.random() * 5), // pequeño detalle "vivo", no afecta a nada funcional
    following: followedIds.has(t.id),
  }));

  const copiedPositions = store.listPositions(req.session.userId).filter((p) => p.source === 'copy');
  res.json({ traders, copiedPositions });
});

router.post('/:traderId/follow', async (req, res) => {
  const trader = TRADERS.find((t) => t.id === req.params.traderId);
  if (!trader) return res.status(404).json({ error: 'Trader no encontrado.' });
  if (store.findCopyFollow(req.session.userId, trader.id)) {
    return res.status(409).json({ error: 'Ya sigues a este trader.' });
  }
  store.addCopyFollow({ userId: req.session.userId, traderId: trader.id });
  // Primer impulso inmediato para que seguir a alguien se note al instante
  // en vez de esperar hasta 10 minutos al próximo ciclo del job.
  runCopyTradingTick().catch(() => {});
  res.status(201).json({ ok: true });
});

router.post('/:traderId/unfollow', (req, res) => {
  const ok = store.removeCopyFollow(req.session.userId, req.params.traderId);
  if (!ok) return res.status(404).json({ error: 'No seguías a este trader.' });
  res.json({ ok: true });
});

module.exports = router;
