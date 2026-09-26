/*
  Herramienta de un solo uso: importa el antiguo data/db.json (fichero
  plano) a Postgres, conservando los mismos IDs para que las referencias
  entre colecciones (positions.userId, analyses.userId, ...) sigan
  apuntando a los usuarios correctos.

  Uso:
    DATABASE_URL=... node server/scripts/migrate-json-to-pg.js

  Seguro de ejecutar más de una vez: usa ON CONFLICT DO NOTHING en todas
  las inserciones, así que registros ya importados no se duplican ni
  fallan la segunda vez.
*/
const fs = require('fs');
const path = require('path');
const db = require('../db');

const DB_JSON_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

async function main() {
  if (!fs.existsSync(DB_JSON_PATH)) {
    console.log(`No hay ${DB_JSON_PATH} que migrar — nada que hacer.`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(DB_JSON_PATH, 'utf8'));
  await db.migrate();

  let counts = { users: 0, positions: 0, analyses: 0, picks: 0, trackedWallets: 0, copyFollows: 0 };

  for (const u of raw.users || []) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, bio, avatar, balance, plan, stripe_customer_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.passwordHash, u.name, u.bio ?? null, u.avatar ?? null, u.balance, u.plan, u.stripeCustomerId ?? null, u.createdAt]
    );
    counts.users++;
  }

  for (const p of raw.positions || []) {
    await db.query(
      `INSERT INTO positions
         (id, user_id, symbol, side, size, entry_price, cost_basis, stop_loss, take_profit, status, close_price, realized_pnl, close_reason, source, copied_from, opened_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.userId, p.symbol, p.side, p.size, p.entryPrice, p.costBasis ?? null, p.stopLoss ?? null,
        p.takeProfit ?? null, p.status, p.closePrice ?? null, p.realizedPnl ?? null, p.closeReason ?? null,
        p.source ?? null, p.copiedFrom ?? null, p.openedAt, p.closedAt ?? null,
      ]
    );
    counts.positions++;
  }

  for (const a of raw.analyses || []) {
    const { id, userId, timeframe, createdAt, ...data } = a;
    await db.query(
      `INSERT INTO analyses (id, user_id, timeframe, data, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [id, userId, timeframe ?? null, JSON.stringify(data), createdAt]
    );
    counts.analyses++;
  }

  for (const p of raw.picks || []) {
    const { id, createdAt, ...data } = p;
    await db.query(
      `INSERT INTO picks (id, data, created_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(data), createdAt]
    );
    counts.picks++;
  }

  for (const w of raw.trackedWallets || []) {
    await db.query(
      `INSERT INTO tracked_wallets (id, user_id, address, label, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.userId, w.address, w.label ?? null, w.createdAt]
    );
    counts.trackedWallets++;
  }

  for (const f of raw.copyFollows || []) {
    await db.query(
      `INSERT INTO copy_follows (id, user_id, trader_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.userId, f.traderId, f.createdAt]
    );
    counts.copyFollows++;
  }

  console.log('Importación completada:', counts);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error migrando data/db.json a Postgres:', err);
    process.exit(1);
  });
