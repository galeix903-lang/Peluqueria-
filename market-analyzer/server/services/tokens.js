/*
  Tokens de la app móvil: access token (JWT corto) + refresh token
  (opaco, guardado hasheado en Postgres — ver store.js). Dos vidas
  distintas a propósito: el access token no necesita ninguna consulta a
  la base de datos para verificarse (rápido, sin estado), y el refresh
  token sí vive en la base de datos para poder revocarse (logout, robo
  de dispositivo) sin tener que esperar a que caduque solo.
*/
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = '2h';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || 'dev-jwt-access-secret-cambia-esto';
}

function issueAccessToken(userId) {
  return jwt.sign({ sub: userId }, accessSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function refreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

module.exports = { issueAccessToken, generateRefreshToken, refreshTokenExpiry, ACCESS_TOKEN_TTL };
