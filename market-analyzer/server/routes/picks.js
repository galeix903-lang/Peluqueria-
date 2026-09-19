const express = require('express');
const store = require('../store');
const { refreshPicks } = require('../services/picksJob');

const router = express.Router();

router.get('/', async (req, res) => {
  let picks = store.listPicks();
  if (picks.length === 0) {
    // Primera vez que se pide y el cron diario todavía no ha corrido:
    // generamos picks al vuelo para no dejar la pantalla vacía.
    await refreshPicks();
    picks = store.listPicks();
  }
  res.json({ picks });
});

module.exports = router;
