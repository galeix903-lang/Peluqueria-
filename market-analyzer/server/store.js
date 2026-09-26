/*
  Persistencia en Postgres (ver server/db.js). Sustituye al antiguo
  fichero JSON plano manteniendo exactamente la misma superficie
  pública (mismos nombres de función, mismas formas de objeto en
  camelCase) para que las rutas que ya la usan no tengan que cambiar
  más que añadir `await` — el mapeo camelCase↔snake_case y
  columna↔JSONB vive aquí dentro, no se filtra a quien la llama.
*/
const crypto = require('crypto');
const { query } = require('./db');

// NUMERIC llega de node-postgres como string (para no perder precisión);
// todo el código que hace aritmética con estos campos espera un number,
// como ya hacía con el fichero JSON.
function num(v) {
  return v === null || v === undefined ? null : Number(v);
}
function iso(v) {
  return v ? new Date(v).toISOString() : null;
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    bio: row.bio,
    avatar: row.avatar,
    balance: num(row.balance),
    plan: row.plan,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    createdAt: iso(row.created_at),
  };
}

function rowToPosition(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    size: num(row.size),
    entryPrice: num(row.entry_price),
    costBasis: num(row.cost_basis),
    stopLoss: num(row.stop_loss),
    takeProfit: num(row.take_profit),
    status: row.status,
    closePrice: num(row.close_price),
    realizedPnl: num(row.realized_pnl),
    closeReason: row.close_reason,
    source: row.source,
    copiedFrom: row.copied_from,
    openedAt: iso(row.opened_at),
    closedAt: iso(row.closed_at),
  };
}

function rowToAnalysis(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, timeframe: row.timeframe, createdAt: iso(row.created_at), ...row.data };
}

function rowToPick(row) {
  if (!row) return null;
  return { id: row.id, createdAt: iso(row.created_at), ...row.data };
}

function rowToTrackedWallet(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, address: row.address, label: row.label, createdAt: iso(row.created_at) };
}

function rowToCopyFollow(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, traderId: row.trader_id, createdAt: iso(row.created_at) };
}

// ---------- Usuarios ----------
async function findUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rowToUser(rows[0]);
}

async function findUserById(userId) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return rowToUser(rows[0]);
}

async function findUserByStripeCustomerId(customerId) {
  const { rows } = await query('SELECT * FROM users WHERE stripe_customer_id = $1', [customerId]);
  return rowToUser(rows[0]);
}

async function createUser({ email, passwordHash, name }) {
  try {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *`,
      [email, passwordHash, name || email.split('@')[0]]
    );
    return rowToUser(rows[0]);
  } catch (err) {
    // 23505 = unique_violation — el índice único sobre lower(email) es
    // quien garantiza de verdad que dos altas concurrentes con el mismo
    // correo no puedan ganar las dos (antes esto lo garantizaba que
    // store.js fuera síncrono de un solo hilo; con Postgres la garantía
    // la da la base de datos, y además funciona con varios procesos).
    if (err.code === '23505') return null;
    throw err;
  }
}

async function updateUserProfile(userId, { name, bio, avatar } = {}) {
  const { rows } = await query(
    `UPDATE users SET
       name = COALESCE($2, name),
       bio = CASE WHEN $3::boolean THEN $4 ELSE bio END,
       avatar = CASE WHEN $5::boolean THEN $6 ELSE avatar END
     WHERE id = $1 RETURNING *`,
    [userId, name ?? null, bio !== undefined, bio ?? null, avatar !== undefined, avatar ?? null]
  );
  return rowToUser(rows[0]);
}

async function updateUserBalance(userId, newBalance) {
  const { rows } = await query('UPDATE users SET balance = $2 WHERE id = $1 RETURNING *', [userId, newBalance]);
  return rowToUser(rows[0]);
}

async function setUserPlan(userId, plan, extra = {}) {
  const { rows } = await query(
    `UPDATE users SET
       plan = $2,
       stripe_customer_id = COALESCE($3, stripe_customer_id),
       stripe_subscription_id = COALESCE($4, stripe_subscription_id)
     WHERE id = $1 RETURNING *`,
    [userId, plan, extra.stripeCustomerId ?? null, extra.stripeSubscriptionId ?? null]
  );
  return rowToUser(rows[0]);
}

// ---------- Posiciones (paper trading) ----------
async function listPositions(userId) {
  const { rows } = await query('SELECT * FROM positions WHERE user_id = $1 ORDER BY opened_at DESC', [userId]);
  return rows.map(rowToPosition);
}

async function createPosition(position) {
  const { rows } = await query(
    `INSERT INTO positions
       (user_id, symbol, side, size, entry_price, cost_basis, stop_loss, take_profit, status, source, copied_from, opened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      position.userId, position.symbol, position.side, position.size, position.entryPrice,
      position.costBasis ?? null, position.stopLoss ?? null, position.takeProfit ?? null,
      position.status || 'open', position.source ?? null, position.copiedFrom ?? null,
      position.openedAt,
    ]
  );
  return rowToPosition(rows[0]);
}

async function closePosition(userId, positionId, { closePrice, closedAt, realizedPnl, closeReason = 'manual' }) {
  const { rows } = await query(
    `UPDATE positions SET status = 'closed', close_price = $3, closed_at = $4, realized_pnl = $5, close_reason = $6
     WHERE id = $2 AND user_id = $1 RETURNING *`,
    [userId, positionId, closePrice, closedAt, realizedPnl, closeReason]
  );
  return rowToPosition(rows[0]);
}

// ---------- Análisis (historial del AI Analyzer) ----------
async function addAnalysis(analysis) {
  const { userId, timeframe, createdAt, ...data } = analysis;
  const { rows } = await query(
    `INSERT INTO analyses (user_id, timeframe, data, created_at) VALUES ($1,$2,$3,COALESCE($4, now())) RETURNING *`,
    [userId, timeframe ?? null, JSON.stringify(data), createdAt ?? null]
  );
  return rowToAnalysis(rows[0]);
}

async function listAnalyses(userId, limit = 20) {
  const { rows } = await query(
    'SELECT * FROM analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows.map(rowToAnalysis);
}

// Cuenta los análisis de hoy (día UTC, mismo criterio que antes con
// `createdAt.slice(0,10)` sobre un ISO string) para el límite del plan gratuito.
async function countAnalysesToday(userId) {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM analyses WHERE user_id = $1 AND created_at >= $2',
    [userId, startOfDayUtc.toISOString()]
  );
  return rows[0].count;
}

// ---------- Picks (Handpicked Bets) ----------
async function listPicks(limit = 20) {
  const { rows } = await query('SELECT * FROM picks ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map(rowToPick);
}

async function addPick(pick) {
  const { createdAt, ...data } = pick;
  const { rows } = await query(
    'INSERT INTO picks (data, created_at) VALUES ($1, COALESCE($2, now())) RETURNING *',
    [JSON.stringify(data), createdAt ?? null]
  );
  return rowToPick(rows[0]);
}

// ---------- Wallet Tracker (simulado) ----------
async function listTrackedWallets(userId) {
  const { rows } = await query('SELECT * FROM tracked_wallets WHERE user_id = $1 ORDER BY created_at', [userId]);
  return rows.map(rowToTrackedWallet);
}

async function addTrackedWallet({ userId, address, label }) {
  const { rows } = await query(
    'INSERT INTO tracked_wallets (user_id, address, label) VALUES ($1,$2,$3) RETURNING *',
    [userId, address, label || null]
  );
  return rowToTrackedWallet(rows[0]);
}

async function removeTrackedWallet(userId, walletId) {
  const { rowCount } = await query('DELETE FROM tracked_wallets WHERE id = $1 AND user_id = $2', [walletId, userId]);
  return rowCount > 0;
}

// ---------- Copy Trading (simulado) ----------
async function listCopyFollows(userId) {
  const { rows } = await query('SELECT * FROM copy_follows WHERE user_id = $1', [userId]);
  return rows.map(rowToCopyFollow);
}

async function findCopyFollow(userId, traderId) {
  const { rows } = await query('SELECT * FROM copy_follows WHERE user_id = $1 AND trader_id = $2', [userId, traderId]);
  return rowToCopyFollow(rows[0]);
}

async function addCopyFollow({ userId, traderId }) {
  const { rows } = await query(
    'INSERT INTO copy_follows (user_id, trader_id) VALUES ($1,$2) RETURNING *',
    [userId, traderId]
  );
  return rowToCopyFollow(rows[0]);
}

async function removeCopyFollow(userId, traderId) {
  const { rowCount } = await query('DELETE FROM copy_follows WHERE user_id = $1 AND trader_id = $2', [userId, traderId]);
  return rowCount > 0;
}

async function listAllCopyFollows() {
  const { rows } = await query('SELECT * FROM copy_follows', []);
  return rows.map(rowToCopyFollow);
}

// ---------- Refresh tokens (auth de la app móvil) ----------
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createRefreshToken({ userId, token, expiresAt, userAgent }) {
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4)',
    [userId, hashToken(token), expiresAt, userAgent || null]
  );
}

// Solo válido si existe, no ha caducado y no ha sido revocado — así un
// token robado de un dispositivo se puede invalidar sin tocar los demás.
async function findValidRefreshToken(token) {
  const { rows } = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function revokeRefreshToken(token) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [hashToken(token)]);
}

async function revokeAllRefreshTokensForUser(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// ---------- Actividad reciente y estadísticas públicas ----------
// Se deriva de las tablas ya existentes (altas, análisis, posiciones) en
// vez de llevar un log aparte: lo que se muestra es siempre un evento
// real que ya ocurrió, nunca un dato inventado. No expone email, nombre,
// importes ni resultado — solo el tipo de evento, el símbolo si aplica y
// la fecha.
async function listRecentActivity(limit = 12) {
  const { rows } = await query(
    `(SELECT 'signup' AS type, NULL AS symbol, created_at AS at FROM users)
     UNION ALL
     (SELECT 'analysis' AS type, data->>'asset' AS symbol, created_at AS at FROM analyses)
     UNION ALL
     (SELECT 'trade_open' AS type, symbol, opened_at AS at FROM positions)
     ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ type: r.type, symbol: r.symbol, at: iso(r.at) }));
}

// Contador agregado real (nº de cuentas) para el sello de confianza de
// la landing — nunca una puntuación inventada tipo "4.9/5".
async function getStats() {
  const { rows } = await query('SELECT COUNT(*)::int AS accounts FROM users', []);
  return { accounts: rows[0].accounts };
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByStripeCustomerId,
  createUser,
  updateUserProfile,
  updateUserBalance,
  setUserPlan,
  listPositions,
  createPosition,
  closePosition,
  addAnalysis,
  listAnalyses,
  countAnalysesToday,
  listPicks,
  addPick,
  listTrackedWallets,
  addTrackedWallet,
  removeTrackedWallet,
  listCopyFollows,
  findCopyFollow,
  addCopyFollow,
  removeCopyFollow,
  listAllCopyFollows,
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  listRecentActivity,
  getStats,
};
