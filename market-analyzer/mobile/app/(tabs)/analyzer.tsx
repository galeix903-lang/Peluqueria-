import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { api, ApiError } from '../../src/services/api';
import { colors, radius } from '../../src/theme';
import { fmtUsd } from '../../src/utils/format';

// Mismos ejemplos mixtos que la web (cripto, acción, fondo, forex): no es
// una lista cerrada, el campo admite cualquier ticker escrito a mano.
// Los marcados con ★ tienen datos de mercado reales (velas OHLCV) detrás:
// la señal sale de un motor de cálculo determinista, no de que la IA
// "opine" mirando la captura — ver server/services/analysisPipeline.js.
const REAL_DATA_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const SYMBOL_CHIPS = ['BTC', 'ETH', 'AAPL', 'SPY', 'EUR/USD'];
const TIMEFRAMES = ['15m', '1H', '4H', '1D', '1W'];

// Lenguaje de sesgo, no de orden de compra/venta: Vantex presenta
// escenarios y probabilidades, nunca una certeza sobre el futuro.
const SIGNAL_META: Record<string, { icon: any; label: string; color: string }> = {
  BUY: { icon: 'arrow-up-right', label: 'Sesgo alcista', color: colors.green },
  SELL: { icon: 'arrow-down-right', label: 'Sesgo bajista', color: colors.red },
  WAIT: { icon: 'arrow-right', label: 'Neutral', color: colors.amber },
};
const TREND_LABEL: Record<string, string> = { BULLISH: 'Alcista', BEARISH: 'Bajista', SIDEWAYS: 'Lateral' };
const MOMENTUM_LABEL: Record<string, string> = { POSITIVE: 'Positivo', NEGATIVE: 'Negativo', NEUTRAL: 'Neutral', UNAVAILABLE: 'No disponible' };
const VOLUME_LABEL: Record<string, string> = { CONFIRMING: 'Confirmando', WEAK: 'Débil', UNAVAILABLE: 'No disponible' };
const STRUCTURE_LABEL: Record<string, string> = { BULLISH: 'Alcista', BEARISH: 'Bajista', MIXED: 'Mixta', UNAVAILABLE: 'No disponible' };
const RISK_LABEL: Record<string, string> = { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' };
const RISK_COLOR: Record<string, string> = { LOW: colors.green, MEDIUM: colors.amber, HIGH: colors.red };

type Analysis = {
  id: string;
  asset: string;
  signal: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  risk: string;
  price?: number;
  trend: string;
  momentum: string;
  volume: string;
  structure: string;
  isChart?: boolean;
  support?: number[];
  resistance?: number[];
  reasons?: string[];
  mainReason?: string;
  scenarios?: {
    primary: string;
    alternative?: string | null;
    invalidation?: string | null;
    keyLevels?: { entryArea?: [number, number] | null; invalidation?: number | null; targets?: number[]; riskContext?: string | null };
  };
  summary: string;
  disclaimer: string;
  mock?: boolean;
  source: 'REAL_DATA' | 'VISUAL';
  timeframe?: string | null;
  createdAt: string;
};

export default function AnalyzerScreen() {
  const router = useRouter();
  const [symbolHint, setSymbolHint] = useState('');
  const [timeframe, setTimeframe] = useState('1D');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [quota, setQuota] = useState<{ plan: string; remainingToday: number | null; dailyLimit: number | null }>({
    plan: 'free', remainingToday: null, dailyLimit: null,
  });
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    try {
      const data = await api.get('/api/analyzer/history');
      setHistory(data.analyses);
      setQuota({ plan: data.plan, remainingToday: data.remainingToday, dailyLimit: data.dailyLimit });
    } catch {
      // El historial es secundario: si falla, la pantalla sigue usable para analizar.
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function pickImage(source: 'camera' | 'library') {
    setError(null);
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(source === 'camera' ? 'Necesitamos permiso de cámara.' : 'Necesitamos permiso para acceder a tus fotos.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.length) return;
    setImage(result.assets[0]);
  }

  const quotaExhausted = quota.remainingToday != null && quota.remainingToday <= 0;

  async function onAnalyze() {
    if (!image) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const res = await fetch(image.uri);
        const blob = await res.blob();
        formData.append('image', blob, 'chart.jpg');
      } else {
        formData.append('image', { uri: image.uri, name: 'chart.jpg', type: image.mimeType || 'image/jpeg' } as any);
      }
      if (symbolHint.trim()) formData.append('symbolHint', symbolHint.trim());
      if (timeframe) formData.append('timeframe', timeframe);

      const data = await api.postForm('/api/analyzer', formData);
      setResult(data.analysis);
      setImage(null);
      await loadHistory();
    } catch (err) {
      if (err instanceof ApiError && (err as any).status === 402) {
        setQuota((q) => ({ ...q, remainingToday: 0 }));
      }
      setError(err instanceof ApiError ? err.message : 'No se pudo completar el análisis.');
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <Screen title="AI Analyzer" subtitle="Sube la captura de un gráfico y recibe una lectura técnica.">
      <Text style={styles.label}>Activo (opcional)</Text>
      <TextInput
        style={styles.input}
        value={symbolHint}
        onChangeText={setSymbolHint}
        placeholder="Cripto, acción, fondo, forex…"
        placeholderTextColor={colors.textDim}
        autoCapitalize="characters"
      />
      <View style={styles.chipRow}>
        {SYMBOL_CHIPS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, symbolHint.toUpperCase() === s.toUpperCase() && styles.chipActive]}
            onPress={() => setSymbolHint(symbolHint.toUpperCase() === s.toUpperCase() ? '' : s)}
          >
            <Text style={[styles.chipText, symbolHint.toUpperCase() === s.toUpperCase() && styles.chipTextActive]}>
              {s}{REAL_DATA_SYMBOLS.includes(s) ? ' ★' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>★ = señal calculada con datos de mercado reales, no solo lectura de la imagen</Text>

      <Text style={[styles.label, { marginTop: 16 }]}>Temporalidad</Text>
      <View style={styles.chipRow}>
        {TIMEFRAMES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, timeframe === t && styles.chipActive]}
            onPress={() => setTimeframe(t)}
          >
            <Text style={[styles.chipText, timeframe === t && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dropzone}>
        {image ? (
          <>
            <Image source={{ uri: image.uri }} style={styles.preview} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => setImage(null)}>
              <Feather name="x" size={14} color={colors.text} />
              <Text style={styles.removeBtnText}>Quitar</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Feather name="image" size={26} color={colors.textDim} />
            <Text style={styles.dropzoneHint}>Ninguna captura seleccionada todavía</Text>
          </>
        )}
      </View>

      <View style={styles.pickRow}>
        <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('camera')}>
          <Feather name="camera" size={16} color={colors.text} />
          <Text style={styles.pickBtnText}>Tomar foto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('library')}>
          <Feather name="upload" size={16} color={colors.text} />
          <Text style={styles.pickBtnText}>Elegir de la galería</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {quotaExhausted ? (
        <View style={styles.upsellCard}>
          <Text style={styles.upsellText}>
            Has usado tus {quota.dailyLimit} análisis gratis de hoy. Vuelve mañana, o mejora tu plan desde la web
            mientras se preparan las compras dentro de la app.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.submitBtn, (!image || submitting) && styles.submitBtnDisabled]}
          onPress={onAnalyze}
          disabled={!image || submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="zap" size={16} color="#fff" />}
          <Text style={styles.submitBtnText}>{submitting ? 'Analizando…' : 'Analizar gráfico'}</Text>
        </TouchableOpacity>
      )}

      {!quotaExhausted && quota.remainingToday != null && quota.dailyLimit != null && (
        <Text style={styles.quotaText}>
          {quota.plan === 'pro' ? 'Análisis ilimitados (Business)' : `${quota.remainingToday} de ${quota.dailyLimit} análisis hoy`}
        </Text>
      )}

      {result && (() => {
        const sig = SIGNAL_META[result.signal] || SIGNAL_META.WAIT;
        const isReal = result.source === 'REAL_DATA';
        const showFacts = result.isChart !== false;
        const scenarios = result.scenarios;
        const keyLevels = scenarios?.keyLevels;
        const canSimulate = isReal && REAL_DATA_SYMBOLS.includes(result.asset);

        function onSimulate() {
          router.push({
            pathname: '/trading',
            params: {
              symbol: result!.asset,
              side: result!.signal === 'SELL' ? 'short' : 'long',
              ...(keyLevels?.invalidation != null ? { stopLoss: String(keyLevels.invalidation) } : {}),
              ...(keyLevels?.targets?.[0] != null ? { takeProfit: String(keyLevels.targets[0]) } : {}),
            },
          });
        }

        return (
          <View style={styles.resultCard}>
            <View style={styles.resultHead}>
              <Text style={styles.resultAsset}>{result.asset}</Text>
              <View style={styles.badgeRow}>
                {result.timeframe ? <View style={styles.badge}><Text style={styles.badgeText}>{result.timeframe}</Text></View> : null}
                {result.mock && <View style={styles.badge}><Text style={styles.badgeText}>Modo de ejemplo</Text></View>}
              </View>
            </View>

            {/* QUICK SUMMARY: se entiende en 5 segundos */}
            <View style={[styles.signalHero, { backgroundColor: `${sig.color}18`, borderColor: sig.color }]}>
              <View style={styles.signalHeroLabelRow}>
                <Feather name={sig.icon} size={22} color={sig.color} />
                <Text style={[styles.signalHeroLabel, { color: sig.color }]}>{sig.label}</Text>
              </View>
              <Text style={styles.signalHeroConfidence}>{result.confidence}% de confianza</Text>
              {(result.momentum !== 'UNAVAILABLE' || result.volume !== 'UNAVAILABLE') && (
                <View style={styles.keySignalsRow}>
                  {result.trend ? <Text style={styles.keySignalText}>Tendencia {(TREND_LABEL[result.trend] || result.trend).toLowerCase()}</Text> : null}
                  {result.momentum !== 'UNAVAILABLE' ? <Text style={styles.keySignalText}>Momentum {(MOMENTUM_LABEL[result.momentum] || result.momentum).toLowerCase()}</Text> : null}
                  {result.volume !== 'UNAVAILABLE' ? <Text style={styles.keySignalText}>Volumen {(VOLUME_LABEL[result.volume] || result.volume).toLowerCase()}</Text> : null}
                </View>
              )}
            </View>

            <View style={[styles.sourceNote, !isReal && styles.sourceNoteVisual]}>
              <Feather name={isReal ? 'check-circle' : 'alert-triangle'} size={14} color={colors.text} />
              <Text style={styles.sourceNoteText}>
                {isReal
                  ? 'Calculado con datos de mercado reales (velas OHLCV, RSI, MACD, EMA, estructura) — sin intervención de un modelo de lenguaje en la decisión.'
                  : 'Lectura visual de la imagen: no verificada con datos de mercado en tiempo real. Trátala como una aproximación, no como un hecho.'}
              </Text>
            </View>

            {canSimulate && (
              <TouchableOpacity style={styles.simulateBtn} onPress={onSimulate}>
                <Feather name="layout" size={14} color={colors.accent} />
                <Text style={styles.simulateBtnText}>Simular este escenario en Paper Trading</Text>
              </TouchableOpacity>
            )}

            <View style={styles.detailDivider}><Text style={styles.detailDividerText}>Análisis detallado</Text></View>

            {showFacts && (
              <View style={styles.factsGrid}>
                <View style={styles.factCell}><Text style={styles.factLabel}>Tendencia</Text><Text style={styles.factValue}>{TREND_LABEL[result.trend] || result.trend}</Text></View>
                <View style={styles.factCell}><Text style={styles.factLabel}>Momentum</Text><Text style={styles.factValue}>{MOMENTUM_LABEL[result.momentum] || result.momentum}</Text></View>
                <View style={styles.factCell}><Text style={styles.factLabel}>Volumen</Text><Text style={styles.factValue}>{VOLUME_LABEL[result.volume] || result.volume}</Text></View>
                <View style={styles.factCell}><Text style={styles.factLabel}>Estructura</Text><Text style={styles.factValue}>{STRUCTURE_LABEL[result.structure] || result.structure}</Text></View>
              </View>
            )}

            {(result.reasons || []).length > 0 && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailBlockTitle}>{result.isChart === false ? 'Motivo' : 'Por qué'}</Text>
                {result.reasons!.map((r, i) => (
                  <Text key={i} style={styles.reasonItem}>• {r}</Text>
                ))}
              </View>
            )}

            {showFacts && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailBlockTitle}>Niveles clave</Text>
                <View style={styles.levelsRow}>
                  <View style={styles.levelCol}>
                    <Text style={styles.levelLabel}>Soportes</Text>
                    <Text style={styles.levelValue}>{(result.support || []).join(' · ') || '—'}</Text>
                  </View>
                  <View style={styles.levelCol}>
                    <Text style={styles.levelLabel}>Resistencias</Text>
                    <Text style={styles.levelValue}>{(result.resistance || []).join(' · ') || '—'}</Text>
                  </View>
                </View>
                <View style={styles.levelsRow}>
                  <View style={styles.levelCol}>
                    <Text style={styles.levelLabel}>Zona de entrada</Text>
                    <Text style={styles.levelValue}>{keyLevels?.entryArea ? `${fmtUsd(keyLevels.entryArea[0])} – ${fmtUsd(keyLevels.entryArea[1])}` : 'No disponible'}</Text>
                  </View>
                  <View style={styles.levelCol}>
                    <Text style={styles.levelLabel}>Objetivos</Text>
                    <Text style={styles.levelValue}>{(keyLevels?.targets || []).join(' · ') || '—'}</Text>
                  </View>
                </View>
                {result.price ? <Text style={styles.priceText}>Precio de referencia: {fmtUsd(result.price)}</Text> : null}
              </View>
            )}

            {scenarios && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailBlockTitle}>Escenarios</Text>
                <View style={styles.scenarioRow}>
                  <Text style={[styles.scenarioTag, styles.scenarioTagPrimary]}>Principal</Text>
                  <Text style={styles.scenarioText}>{scenarios.primary}</Text>
                </View>
                {scenarios.alternative ? (
                  <View style={styles.scenarioRow}>
                    <Text style={[styles.scenarioTag, styles.scenarioTagAlt]}>Alternativo</Text>
                    <Text style={styles.scenarioText}>{scenarios.alternative}</Text>
                  </View>
                ) : null}
                {scenarios.invalidation ? (
                  <View style={styles.scenarioRow}>
                    <Text style={[styles.scenarioTag, styles.scenarioTagInvalid]}>Invalidación</Text>
                    <Text style={styles.scenarioText}>{scenarios.invalidation}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.detailBlock}>
              <Text style={styles.detailBlockTitle}>Riesgo</Text>
              <View style={styles.riskRow}>
                <View style={[styles.badge, { backgroundColor: `${RISK_COLOR[result.risk] || colors.textDim}22` }]}>
                  <Text style={[styles.badgeText, { color: RISK_COLOR[result.risk] || colors.textDim }]}>{RISK_LABEL[result.risk] || result.risk}</Text>
                </View>
              </View>
              {keyLevels?.riskContext ? <Text style={styles.riskContextText}>{keyLevels.riskContext}</Text> : null}
            </View>

            {result.summary && result.summary !== result.mainReason ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailBlockTitle}>{isReal ? 'Nota' : 'Explicación de la IA'}</Text>
                <Text style={styles.summary}>{result.summary}</Text>
              </View>
            ) : null}
            <Text style={styles.disclaimer}>{result.disclaimer}</Text>
          </View>
        );
      })()}

      <Text style={styles.sectionLabel}>Historial reciente</Text>
      {loadingHistory ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
      ) : history.length === 0 ? (
        <Text style={styles.emptyText}>Todavía no has analizado ningún gráfico.</Text>
      ) : (
        history.map((a) => (
          <TouchableOpacity key={a.id} style={styles.historyCard} onPress={() => setResult(a)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyAsset}>{a.asset}</Text>
              <Text style={styles.historyDate}>{new Date(a.createdAt).toLocaleString('es-ES')}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${(SIGNAL_META[a.signal] || SIGNAL_META.WAIT).color}22` }]}>
              <Text style={[styles.badgeText, { color: (SIGNAL_META[a.signal] || SIGNAL_META.WAIT).color }]}>{(SIGNAL_META[a.signal] || SIGNAL_META.WAIT).label}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  chipTextActive: { color: '#fff' },
  dropzone: {
    marginTop: 16, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md,
    padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.fieldBg, minHeight: 120,
  },
  dropzoneHint: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim },
  preview: { width: '100%', height: 160, borderRadius: radius.md, resizeMode: 'cover' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  removeBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12,
  },
  pickBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text },
  error: { color: colors.red, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 12 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  quotaText: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 8 },
  upsellCard: { backgroundColor: colors.accentDim, borderRadius: radius.md, padding: 14, marginTop: 16 },
  upsellText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19 },
  resultCard: {
    marginTop: 20, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  resultHead: { marginBottom: 12 },
  resultAsset: { fontSize: 17, fontFamily: 'Inter_800ExtraBold', color: colors.text, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: colors.fieldBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textDim },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 6 },
  signalHero: {
    alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 22, paddingHorizontal: 16, marginBottom: 14,
  },
  signalHeroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalHeroLabel: { fontSize: 22, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.5 },
  signalHeroConfidence: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.text, marginTop: 6 },
  signalHeroReason: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  keySignalsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  keySignalText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.text },
  sourceNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.fieldBg,
    borderRadius: radius.md, padding: 12, marginBottom: 14,
  },
  sourceNoteVisual: { backgroundColor: colors.amberBg },
  sourceNoteText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 17 },
  simulateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentDim,
    borderRadius: radius.md, paddingVertical: 12, marginBottom: 16,
  },
  simulateBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.accent },
  detailDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  detailDividerText: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.6,
    borderTopWidth: 1, borderTopColor: colors.border, flex: 1, paddingTop: 12, textAlign: 'center',
  },
  detailBlock: { marginBottom: 18 },
  detailBlockTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  factCell: {
    width: '47%', backgroundColor: colors.fieldBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  factLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  factValue: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.text },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  riskLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  riskContextText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 17 },
  priceText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginTop: 8 },
  reasonItem: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19, marginTop: 2 },
  levelsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  levelCol: { flex: 1 },
  levelLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textDim, marginBottom: 2 },
  levelValue: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.text },
  scenarioRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  scenarioTag: {
    fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start', flexShrink: 0,
  },
  scenarioTagPrimary: { backgroundColor: colors.accentDim, color: colors.accent },
  scenarioTagAlt: { backgroundColor: colors.fieldBg, color: colors.textDim },
  scenarioTagInvalid: { backgroundColor: colors.redBg, color: colors.red },
  scenarioText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 18 },
  summary: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 19, marginBottom: 10 },
  disclaimer: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, lineHeight: 15 },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  historyAsset: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.text },
  historyDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 },
});
