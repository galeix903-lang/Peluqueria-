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
  return { users: [], positions: [], analyses: [], picks: [] };
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
  const user = {
    id: id(),
    email,
    passwordHash,
    name: name || email.split('@')[0],
    balance: 100000, // saldo virtual inicial de paper trading
    plan: 'free', // 'free' | 'pro'
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
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

function closePosition(userId, positionId, { closePrice, closedAt, realizedPnl }) {
  const db = load();
  const pos = db.positions.find((p) => p.id === positionId && p.userId === userId);
  if (!pos) return null;
  pos.status = 'closed';
  pos.closePrice = closePrice;
  pos.closedAt = closedAt;
  pos.realizedPnl = realizedPnl;
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

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByStripeCustomerId,
  createUser,
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
};
