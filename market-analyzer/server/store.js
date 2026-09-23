/*
  Persistencia simple en un fichero JSON — mismo patrón que el store.js del
  "sistema de llamadas" hermano de este repo. Es suficiente para una demo/
  portfolio con carga moderada; si esto crece a producción con muchos
  usuarios concurrentes, migrar a SQLite/Postgres (los métodos de aquí
  abajo son la única superficie que habría que reescribir).
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function emptyDb() {
  return { users: [], positions: [], analyses: [], picks: [], trackedWallets: [], copyFollows: [] };
}

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch (e) {
    return emptyDb();
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function id() {
  return crypto.randomUUID();
}

// ---------- Usuarios ----------
function findUserByEmail(email) {
  const db = load();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function findUserById(userId) {
  const db = load();
  return db.users.find((u) => u.id === userId) || null;
}

function createUser({ email, passwordHash, name }) {
  const db = load();
  // Repite la comprobación de email único aquí (no solo en la ruta) sin
  // ningún await de por medio: dos signups concurrentes con el mismo
  // email pueden haber pasado los dos el check de la ruta (que sí tiene
  // un await a la bcrypt.hash entre medias), pero como JS es de un solo
  // hilo y esta función es síncrona de principio a fin, solo una de las
  // dos peticiones puede ejecutar este load()+push()+save() sin que la
  // otra se cuele en medio — así que como mucho una gana.
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return null;
  }
  const user = {
    id: id(),
    email,
    passwordHash,
    name: name || email.split('@')[0],
    bio: null,
    avatar: null,
    balance: 100000, // saldo virtual inicial de paper trading
    plan: 'free', // 'free' | 'plus' (mostrado como "Pro") | 'pro' (mostrado como "Business")
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save(db);
  return user;
}

// Actualiza los campos de perfil que llegan definidos (name/bio/avatar),
// sin tocar los que no — así una petición que solo cambia la bio no
// borra el avatar, y viceversa.
function updateUserProfile(userId, { name, bio, avatar } = {}) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (name !== undefined) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (avatar !== undefined) user.avatar = avatar;
  save(db);
  return user;
}

function updateUserBalance(userId, newBalance) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.balance = newBalance;
  save(db);
  return user;
}

function findUserByStripeCustomerId(customerId) {
  const db = load();
  return db.users.find((u) => u.stripeCustomerId === customerId) || null;
}

function setUserPlan(userId, plan, extra = {}) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.plan = plan;
  Object.assign(user, extra);
  save(db);
  return user;
}

// ---------- Posiciones (paper trading) ----------
function listPositions(userId) {
  const db = load();
  return db.positions.filter((p) => p.userId === userId).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

function createPosition(position) {
  const db = load();
  const record = { id: id(), ...position };
  db.positions.push(record);
  save(db);
  return record;
}

function closePosition(userId, positionId, { closePrice, closedAt, realizedPnl, closeReason = 'manual' }) {
  const db = load();
  const pos = db.positions.find((p) => p.id === positionId && p.userId === userId);
  if (!pos) return null;
  pos.status = 'closed';
  pos.closePrice = closePrice;
  pos.closedAt = closedAt;
  pos.realizedPnl = realizedPnl;
  pos.closeReason = closeReason;
  save(db);
  return pos;
}

// ---------- Análisis (historial del AI Analyzer) ----------
function addAnalysis(analysis) {
  const db = load();
  const record = { id: id(), ...analysis };
  db.analyses.push(record);
  save(db);
  return record;
}

function listAnalyses(userId, limit = 20) {
  const db = load();
  return db.analyses
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// Cuenta los análisis de hoy para aplicar el límite del plan gratuito.
// Reutiliza los mismos registros que guarda addAnalysis — no hace falta
// ningún contador aparte.
function countAnalysesToday(userId) {
  const db = load();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return db.analyses.filter((a) => a.userId === userId && a.createdAt.slice(0, 10) === today).length;
}

// ---------- Picks (Handpicked Bets) ----------
function listPicks(limit = 20) {
  const db = load();
  return db.picks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

function addPick(pick) {
  const db = load();
  const record = { id: id(), ...pick };
  db.picks.push(record);
  save(db);
  return record;
}

// ---------- Wallet Tracker (simulado) ----------
function listTrackedWallets(userId) {
  const db = load();
  return db.trackedWallets.filter((w) => w.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function addTrackedWallet({ userId, address, label }) {
  const db = load();
  const record = { id: id(), userId, address, label: label || null, createdAt: new Date().toISOString() };
  db.trackedWallets.push(record);
  save(db);
  return record;
}

function removeTrackedWallet(userId, walletId) {
  const db = load();
  const before = db.trackedWallets.length;
  db.trackedWallets = db.trackedWallets.filter((w) => !(w.id === walletId && w.userId === userId));
  save(db);
  return db.trackedWallets.length < before;
}

// ---------- Copy Trading (simulado) ----------
function listCopyFollows(userId) {
  const db = load();
  return db.copyFollows.filter((f) => f.userId === userId);
}

function findCopyFollow(userId, traderId) {
  const db = load();
  return db.copyFollows.find((f) => f.userId === userId && f.traderId === traderId) || null;
}

function addCopyFollow({ userId, traderId }) {
  const db = load();
  const record = { id: id(), userId, traderId, createdAt: new Date().toISOString() };
  db.copyFollows.push(record);
  save(db);
  return record;
}

function removeCopyFollow(userId, traderId) {
  const db = load();
  const before = db.copyFollows.length;
  db.copyFollows = db.copyFollows.filter((f) => !(f.userId === userId && f.traderId === traderId));
  save(db);
  return db.copyFollows.length < before;
}

function listAllCopyFollows() {
  const db = load();
  return db.copyFollows;
}

// ---------- Actividad reciente (para el aviso público de "en vivo") ----------
// Se deriva de las colecciones ya existentes (altas, análisis, posiciones)
// en vez de llevar un log aparte: así lo que se muestra es siempre un
// evento real que ya ocurrió, nunca un dato inventado, y no hay un
// segundo sitio donde se pueda desincronizar. No expone email, nombre,
// importes ni resultado — solo el tipo de evento, el símbolo si aplica y
// la fecha.
// Contadores agregados reales (nº de cuentas), para el sello de confianza
// de la landing — nunca una puntuación inventada tipo "4.9/5".
function getStats() {
  const db = load();
  return { accounts: db.users.length };
}

function listRecentActivity(limit = 12) {
  const db = load();
  const events = [
    ...db.users.map((u) => ({ type: 'signup', at: u.createdAt })),
    ...db.analyses.map((a) => ({ type: 'analysis', symbol: a.asset || null, at: a.createdAt })),
    ...db.positions.map((p) => ({ type: 'trade_open', symbol: p.symbol || null, at: p.openedAt })),
  ].filter((e) => e.at);
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
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
  listRecentActivity,
  getStats,
};
