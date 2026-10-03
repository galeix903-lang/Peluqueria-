-- Vincula una posición de Paper Trading con el análisis del AI Analyzer
-- que la originó (cuando se abre desde "Simular este escenario"), para
-- poder cerrar el círculo predicción -> acción -> resultado real tanto
-- en el propio ticket como en el historial/track record del análisis.
ALTER TABLE positions ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS positions_analysis_idx ON positions (analysis_id);
