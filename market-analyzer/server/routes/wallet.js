const express = require('express');
const store = require('../store');
const { fetchWalletSnapshot } = require('../services/wallet');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// Wallets seguidas por el usuario, cada una con su snapshot simulado.
router.get('/', asyncHandler(async (req, res) => {
  const wallets = store.listTrackedWallets(req.session.userId);
  const withSnapshot = await Promise.all(wallets.map(async (w) => ({
    ...w,
    snapshot: await fetchWalletSnapshot(w.address),
  })));
  res.json({ wallets: withSnapshot });
}));

// Vista previa de una dirección antes de empezar a seguirla.
router.get('/preview/:address', asyncHandler(async (req, res) => {
  const address = (req.params.address || '').trim();
  if (!address) return res.status(400).json({ error: 'Falta la dirección.' });
  const snapshot = await fetchWalletSnapshot(address);
  res.json({ snapshot });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (req.body?.address !== undefined && typeof req.body.address !== 'string') {
    return res.status(400).json({ error: 'Introduce una dirección de wallet.' });
  }
  if (req.body?.label !== undefined && typeof req.body.label !== 'string') {
    return res.status(400).json({ error: 'Etiqueta no válida.' });
  }
  const address = (req.body?.address || '').trim();
  const label = (req.body?.label || '').trim().slice(0, 40) || null;
  if (!address) return res.status(400).json({ error: 'Introduce una dirección de wallet.' });
  if (address.length > 80) return res.status(400).json({ error: 'La dirección es demasiado larga.' });
  const existing = store.listTrackedWallets(req.session.userId);
  if (existing.some((w) => w.address.toLowerCase() === address.toLowerCase())) {
    return res.status(409).json({ error: 'Ya estás siguiendo esta wallet.' });
  }
  const wallet = store.addTrackedWallet({ userId: req.session.userId, address, label });
  const snapshot = await fetchWalletSnapshot(address);
  res.status(201).json({ wallet: { ...wallet, snapshot } });
}));

router.delete('/:id', (req, res) => {
  const ok = store.removeTrackedWallet(req.session.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Wallet no encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
