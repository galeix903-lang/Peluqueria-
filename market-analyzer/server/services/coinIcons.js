/*
  Resolución de logos de criptomonedas — sistema escalable, no una lista
  manual de "si es BTC pon este PNG". Reutiliza la misma fuente que ya usa
  Cryptolyzer para precios/velas (CoinGecko, sin API key) en vez de añadir un
  segundo proveedor:

  1. SEED_SYMBOL_TO_ID: símbolo -> id de CoinGecko, para ~90 monedas muy
     conocidas. No son los logos en sí (esos se piden a la API y se
     cachean), solo el identificador único que evita ambigüedad — si dos
     monedas distintas compartieran ticker, el seed fija cuál es "la"
     BTC/ETH/etc. de verdad en vez de dejarlo a una búsqueda difusa.
  2. Para cualquier símbolo fuera del seed (de los "cientos o miles"
     que puede escribir un usuario en el Analyzer), se resuelve en vivo
     contra el buscador público de CoinGecko (/search) y el resultado se
     cachea — así la cobertura crece sola sin tocar código.
  3. Caché en memoria con TTL largo (los logos no cambian) + caché
     negativa corta para símbolos que no existen, para no repetir
     búsquedas inútiles.

  El frontend nunca llama a CoinGecko directamente: todo pasa por
  /api/market/icons, que es quien aplica caché y evita que cientos de
  pestañas machaquen el rate limit del proveedor gratuito.
*/

const SEED_SYMBOL_TO_ID = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot',
  MATIC: 'matic-network', POL: 'matic-network', UNI: 'uniswap', LTC: 'litecoin', ATOM: 'cosmos',
  NEAR: 'near', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', TRX: 'tron', TON: 'the-open-network',
  SHIB: 'shiba-inu', BCH: 'bitcoin-cash', XLM: 'stellar', ETC: 'ethereum-classic', FIL: 'filecoin',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', PEPE: 'pepe', SUI: 'sui',
  HBAR: 'hedera-hashgraph', ICP: 'internet-computer', VET: 'vechain', ALGO: 'algorand',
  SAND: 'the-sandbox', MANA: 'decentraland', AAVE: 'aave', MKR: 'maker', CRO: 'crypto-com-chain',
  INJ: 'injective-protocol', RUNE: 'thorchain', FTM: 'fantom', GRT: 'the-graph', XMR: 'monero',
  EOS: 'eos', XTZ: 'tezos', THETA: 'theta-token', AXS: 'axie-infinity', FLOW: 'flow',
  CHZ: 'chiliz', KAVA: 'kava', ZEC: 'zcash', DASH: 'dash', NEO: 'neo', WAVES: 'waves',
  QNT: 'quant-network', CAKE: 'pancakeswap-token', GALA: 'gala', LDO: 'lido-dao',
  SNX: 'synthetix-network-token', CRV: 'curve-dao-token', '1INCH': '1inch',
  COMP: 'compound-governance-token', ENJ: 'enjincoin', BAT: 'basic-attention-token',
  ZRX: '0x', YFI: 'yearn-finance', SUSHI: 'sushi', REN: 'republic-protocol', OMG: 'omisego',
  QTUM: 'qtum', ZIL: 'zilliqa', ICX: 'icon', ONT: 'ontology', WLD: 'worldcoin-wld',
  TIA: 'celestia', SEI: 'sei-network', STX: 'blockstack', IMX: 'immutable-x',
  RNDR: 'render-token', FET: 'fetch-ai', AR: 'arweave', KAS: 'kaspa', PYTH: 'pyth-network',
  JUP: 'jupiter-exchange-solana', BONK: 'bonk', WIF: 'dogwifcoin', FLOKI: 'floki',
};

const LOGO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días — los logos no cambian
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000; // 1 día — por si el símbolo llega más tarde a CoinGecko
const SEARCH_TIMEOUT_MS = 5000;
const SEARCH_CONCURRENCY = 3;

// symbol -> { id, symbol, name, logo, resolvedAt } | { notFoundAt }
const iconCache = new Map();
let seedLoadPromise = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchJsonWithTimeout(url, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CoinGecko respondió ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cacheIcon(symbol, icon) {
  iconCache.set(symbol, { ...icon, resolvedAt: Date.now() });
}

function cacheNotFound(symbol) {
  iconCache.set(symbol, { notFoundAt: Date.now() });
}

function readCache(symbol) {
  const hit = iconCache.get(symbol);
  if (!hit) return undefined;
  if (hit.notFoundAt) {
    if (Date.now() - hit.notFoundAt > NOT_FOUND_TTL_MS) return undefined;
    return null; // caché negativa vigente
  }
  if (Date.now() - hit.resolvedAt > LOGO_CACHE_TTL_MS) return undefined;
  return { id: hit.id, symbol: hit.symbol, name: hit.name, logo: hit.logo };
}

// Una sola llamada a /coins/markets resuelve el logo de TODAS las monedas
// del seed de golpe (mucho más barato que una búsqueda por símbolo), y
// se reutiliza entre peticiones distintas gracias a esta promesa
// compartida — si dos requests piden iconos a la vez antes de que
// termine, la segunda espera a la misma llamada en vez de duplicarla.
function loadSeedIcons() {
  if (seedLoadPromise) return seedLoadPromise;
  seedLoadPromise = (async () => {
    const ids = [...new Set(Object.values(SEED_SYMBOL_TO_ID))].join(',');
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=250&sparkline=false`;
      const payload = await fetchJsonWithTimeout(url, 8000);
      if (!Array.isArray(payload)) throw new Error('Respuesta de /coins/markets con forma inesperada.');
      const byId = new Map(payload.map((c) => [c.id, c]));
      for (const [symbol, geckoId] of Object.entries(SEED_SYMBOL_TO_ID)) {
        const coin = byId.get(geckoId);
        if (coin?.image) {
          cacheIcon(symbol, { id: geckoId, symbol, name: coin.name, logo: coin.image });
        }
      }
    } catch (err) {
      // Si falla, no se cachea nada como "no encontrado" — cada símbolo
      // caerá al camino de búsqueda individual más abajo, que es más
      // lento pero sigue funcionando sin esta precarga.
      console.error('coinIcons: no se pudo precargar el seed de logos:', err.message);
    }
  })();
  return seedLoadPromise;
}

// Para cualquier símbolo fuera del seed: busca en CoinGecko y se queda
// con la coincidencia de símbolo exacto con menor market_cap_rank (la
// moneda "real"/más grande de ese ticker) en vez de la primera que
// devuelva la búsqueda — así, si existen varios tokens con el mismo
// ticker, Cryptolyzer no enseña el logo de una copia/scam por delante del
// activo legítimo.
async function searchIcon(symbol) {
  try {
    const payload = await fetchJsonWithTimeout(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`
    );
    const coins = Array.isArray(payload?.coins) ? payload.coins : [];
    const exact = coins.filter((c) => (c.symbol || '').toUpperCase() === symbol);
    const candidates = exact.length ? exact : coins;
    if (!candidates.length) return null;
    candidates.sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
    const best = candidates[0];
    const logo = best.large || best.thumb;
    if (!logo || logo.includes('missing_large')) return null;
    return { id: best.id, symbol, name: best.name, logo };
  } catch (err) {
    return null;
  }
}

async function resolveWithConcurrency(symbols, limit, worker) {
  const queue = [...symbols];
  const results = {};
  async function run() {
    while (queue.length) {
      const symbol = queue.shift();
      results[symbol] = await worker(symbol);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, symbols.length) }, run));
  return results;
}

// Punto de entrada único: dado un array de símbolos, devuelve
// { SYMBOL: {id,symbol,name,logo} | null } — null significa "no existe
// ese logo", nunca una URL rota, para que el frontend sepa cuándo pintar
// el fallback en vez de intentar cargar una imagen inexistente.
async function resolveIcons(symbols) {
  const normalized = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  if (!normalized.length) return {};

  await loadSeedIcons();

  const result = {};
  const unresolved = [];
  for (const symbol of normalized) {
    const cached = readCache(symbol);
    if (cached !== undefined) {
      result[symbol] = cached;
    } else {
      unresolved.push(symbol);
    }
  }

  if (unresolved.length) {
    const searched = await resolveWithConcurrency(unresolved, SEARCH_CONCURRENCY, async (symbol) => {
      const icon = await searchIcon(symbol);
      if (icon) cacheIcon(symbol, icon);
      else cacheNotFound(symbol);
      return icon;
    });
    Object.assign(result, searched);
  }

  return result;
}

async function resolveIcon(symbol) {
  const result = await resolveIcons([symbol]);
  return result[String(symbol || '').trim().toUpperCase()] || null;
}

// Para el buscador/selector de activos: coincidencias por nombre o
// símbolo (p.ej. "bitc" -> Bitcoin), directamente desde CoinGecko,
// recortadas a un puñado de resultados relevantes.
async function searchCoins(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  try {
    const payload = await fetchJsonWithTimeout(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`
    );
    const coins = Array.isArray(payload?.coins) ? payload.coins : [];
    return coins
      .filter((c) => c.large && !c.large.includes('missing_large'))
      .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))
      .slice(0, 8)
      .map((c) => ({ id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, logo: c.large }));
  } catch {
    return [];
  }
}

module.exports = { resolveIcons, resolveIcon, searchCoins };
