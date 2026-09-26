/*
  Conexión a Postgres — sustituye al fichero JSON plano de server/store.js
  (ver ahí el porqué: no aguanta producción con usuarios concurrentes).

  DATABASE_URL es la única fuente de verdad de a qué base de datos
  conectarse: en local apunta al Postgres de desarrollo (ver .env.example),
  en Render apunta a la base de datos gestionada que crea render.yaml.
*/
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'Falta DATABASE_URL. Copia .env.example a .env y pon la cadena de conexión ' +
    'de tu Postgres local (ver README, sección "Base de datos").'
  );
}

const pool = new Pool({
  connectionString,
  // Render (y la mayoría de Postgres gestionados) exige TLS pero con un
  // certificado que Node no puede validar contra una CA conocida sin
  // configuración extra; rejectUnauthorized:false es el ajuste estándar
  // para esos proveedores gestionados, no una relajación arbitraria de
  // seguridad — la conexión sigue cifrada, solo no se verifica la cadena
  // de certificados.
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // Un cliente inactivo del pool puede fallar en segundo plano (ej. el
  // servidor de Postgres cierra la conexión); sin este handler, Node lo
  // trata como una excepción no capturada y tira el proceso entero.
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

// Migraciones idempotentes: se ejecutan solas al arrancar el servidor
// (ver server/index.js). Cada fichero de server/migrations/*.sql debe
// poder correr varias veces sin romper nada (CREATE TABLE IF NOT EXISTS,
// etc.) — nada de un runner con tabla de versiones todavía: con el
// tamaño actual del esquema no hace falta esa complejidad.
async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
  }
}

module.exports = { pool, query, migrate };
