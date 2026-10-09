// Constantes compartidas entre signalEngine.js y dataValidation.js,
// separadas en su propio fichero para que dataValidation (que debe
// correr ANTES que el motor de señales) no tenga que importar el motor
// completo solo para conocer el mínimo de velas exigido.
const MIN_CANDLES = 30; // por debajo de esto, no hay base suficiente para nada

module.exports = { MIN_CANDLES };
