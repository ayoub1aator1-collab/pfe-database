/*
=============================================================
  ONCF Z2M — Système de Supervision VFD
  Fichier  : App.js
  Rôle     : Dashboard React temps réel
  Auteur   : PFE 2024-2025
  Version  : 2.0
=============================================================
*/

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Configuration ────────────────────────────────────────
const API_URL        = "http://localhost:8000/data";
const POLL_INTERVAL  = 1000;   // ms
const HISTORY_MAX    = 30;     // points dans le graphe
const ALARM_TEMP     = 45;     // °C
const ALARM_PRESSION = 20;     // Bar
const WARN_TEMP      = 42;     // °C
const WARN_PRESSION  = 18;     // Bar

// ─── Styles CSS-in-JS ────────────────────────────────────
const S = {
  /* Fond dégradé sombre */
  app: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: "#e2e8f0",
    padding: "24px 20px",
    boxSizing: "border-box",
  },

  /* En-tête */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "28px",
    flexWrap: "wrap",
    gap: "12px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "14px" },
  logo: {
    width: "46px", height: "46px", borderRadius: "12px",
    background: "linear-gradient(135deg, #1e40af, #3b82f6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "22px", fontWeight: "700", color: "#fff",
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: "20px", fontWeight: "700", color: "#f1f5f9", lineHeight: 1.2 },
  subtitle: { margin: 0, fontSize: "13px", color: "#64748b", marginTop: "2px" },

  /* Badges de statut connexion */
  statusBadge: (online) => ({
    display: "flex", alignItems: "center", gap: "7px",
    padding: "6px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: "600",
    background: online ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
    color: online ? "#10b981" : "#ef4444",
    border: `1px solid ${online ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
  }),
  statusDot: (online) => ({
    width: "8px", height: "8px", borderRadius: "50%",
    background: online ? "#10b981" : "#ef4444",
    animation: online ? "pulse 1.5s ease-in-out infinite" : "none",
  }),

  /* Grille de cards */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },

  /* Card glassmorphism */
  card: (alarm, warn) => ({
    background: alarm
      ? "rgba(239,68,68,0.08)"
      : warn
      ? "rgba(234,179,8,0.06)"
      : "rgba(255,255,255,0.04)",
    border: alarm
      ? "1px solid rgba(239,68,68,0.4)"
      : warn
      ? "1px solid rgba(234,179,8,0.3)"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "22px 24px",
    backdropFilter: "blur(12px)",
    transition: "all 0.3s ease",
    position: "relative",
    overflow: "hidden",
  }),

  cardGlow: (alarm, warn) => ({
    position: "absolute", top: 0, left: 0, right: 0, height: "3px",
    borderRadius: "16px 16px 0 0",
    background: alarm
      ? "linear-gradient(90deg, #ef4444, #dc2626)"
      : warn
      ? "linear-gradient(90deg, #f59e0b, #d97706)"
      : "linear-gradient(90deg, #3b82f6, #1d4ed8)",
  }),

  cardIcon: { fontSize: "26px", marginBottom: "12px", display: "block" },
  cardLabel: { fontSize: "12px", color: "#64748b", fontWeight: "600",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" },
  cardValue: (alarm, warn) => ({
    fontSize: "42px", fontWeight: "700", lineHeight: 1,
    color: alarm ? "#f87171" : warn ? "#fbbf24" : "#f1f5f9",
    transition: "color 0.3s",
  }),
  cardUnit: { fontSize: "18px", fontWeight: "400", color: "#94a3b8", marginLeft: "4px" },
  cardSub: { fontSize: "12px", color: "#475569", marginTop: "6px" },

  /* Alarme badge */
  alarmBadge: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    marginTop: "10px", padding: "4px 10px", borderRadius: "8px",
    background: "rgba(239,68,68,0.15)", color: "#f87171",
    fontSize: "11px", fontWeight: "600",
    border: "1px solid rgba(239,68,68,0.25)",
  },
  warnBadge: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    marginTop: "10px", padding: "4px 10px", borderRadius: "8px",
    background: "rgba(234,179,8,0.12)", color: "#fbbf24",
    fontSize: "11px", fontWeight: "600",
    border: "1px solid rgba(234,179,8,0.2)",
  },

  /* Ventilateurs — icônes visuelles */
  moteurs: {
    display: "flex", gap: "8px", marginTop: "8px",
  },
  moteurIcon: (actif) => ({
    width: "32px", height: "32px", borderRadius: "50%",
    background: actif ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
    border: `2px solid ${actif ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "16px",
    filter: actif ? "none" : "grayscale(1) opacity(0.3)",
    transition: "all 0.3s",
    animation: actif ? "spin 1.5s linear infinite" : "none",
  }),

  /* Barre de progression */
  progressBar: { marginTop: "12px" },
  progressTrack: {
    height: "5px", borderRadius: "3px",
    background: "rgba(255,255,255,0.08)", overflow: "hidden",
  },
  progressFill: (pct, alarm, warn) => ({
    height: "100%", borderRadius: "3px",
    width: `${Math.min(100, pct)}%`,
    background: alarm
      ? "linear-gradient(90deg, #ef4444, #dc2626)"
      : warn
      ? "linear-gradient(90deg, #f59e0b, #d97706)"
      : "linear-gradient(90deg, #3b82f6, #60a5fa)",
    transition: "width 0.6s ease",
  }),
  progressLabels: {
    display: "flex", justifyContent: "space-between",
    fontSize: "10px", color: "#475569", marginTop: "3px",
  },

  /* Section graphe historique */
  historySection: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "16px", padding: "20px 24px",
    marginBottom: "16px",
  },
  historyTitle: { fontSize: "13px", fontWeight: "600", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "14px" },

  /* Footer */
  footer: { textAlign: "center", fontSize: "11px", color: "#334155", marginTop: "8px" },

  /* Mode source badge */
  modeBadge: (mode) => ({
    fontSize: "11px", padding: "3px 9px", borderRadius: "6px", fontWeight: "500",
    background: mode === "arduino"
      ? "rgba(16,185,129,0.12)"
      : "rgba(99,102,241,0.12)",
    color: mode === "arduino" ? "#34d399" : "#a5b4fc",
    border: `1px solid ${mode === "arduino" ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)"}`,
    marginLeft: "8px",
  }),
};

// ─── Injection CSS globale ─────────────────────────────────
const globalCSS = `
  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:.6; transform:scale(1.15); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes alarmPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
    50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
`;

// ─── Mini graphe SVG ─────────────────────────────────────
function MiniGraph({ data, color, min, max }) {
  if (data.length < 2) return null;
  const W = 600, H = 48;
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  });
  const fill = `${pts.join(" ")} ${W},${H} 0,${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="48" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill={`url(#g${color.replace("#","")})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Composant Card capteur ───────────────────────────────
function SensorCard({ icon, label, value, unit, sub, alarm, warn, pct, pctMin, pctMax, extra }) {
  return (
    <div style={{...S.card(alarm, warn), animation: alarm ? "alarmPulse 1.5s ease infinite" : "none" }}>
      <div style={S.cardGlow(alarm, warn)} />
      <span style={S.cardIcon}>{icon}</span>
      <div style={S.cardLabel}>{label}</div>
      <div style={S.cardValue(alarm, warn)}>
        {value ?? "--"}
        <span style={S.cardUnit}>{unit}</span>
      </div>
      {sub && <div style={S.cardSub}>{sub}</div>}
      {alarm && <div style={S.alarmBadge}>⚠️ ALARME</div>}
      {!alarm && warn && <div style={S.warnBadge}>⚡ ATTENTION</div>}
      {extra}
      {pct !== undefined && (
        <div style={S.progressBar}>
          <div style={S.progressTrack}>
            <div style={S.progressFill(pct, alarm, warn)} />
          </div>
          <div style={S.progressLabels}>
            <span>{pctMin}</span><span>{pctMax}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────
export default function App() {
  const [data,    setData]    = useState(null);
  const [online,  setOnline]  = useState(false);
  const [history, setHistory] = useState({ temp: [], pressure: [], freq: [] });
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  // Injection CSS globale une seule fois
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = globalCSS;
    document.head.appendChild(style);
    document.title = "ONCF Z2M — Supervision VFD";
    return () => document.head.removeChild(style);
  }, []);

  // Polling API
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setOnline(true);
      setLastUpdate(new Date().toLocaleTimeString("fr-FR"));
      setHistory(prev => ({
        temp:     [...prev.temp.slice(-(HISTORY_MAX-1)),     json.temp],
        pressure: [...prev.pressure.slice(-(HISTORY_MAX-1)), json.pressure],
        freq:     [...prev.freq.slice(-(HISTORY_MAX-1)),     json.freq],
      }));
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  // Dérivations
  const temp     = data?.temp     ?? null;
  const pressure = data?.pressure ?? null;
  const motors   = data?.motors   ?? 0;
  const freq     = data?.freq     ?? null;
  const mode     = data?.mode     ?? "simulation";

  const alarmTemp   = temp     !== null && temp     > ALARM_TEMP;
  const alarmPress  = pressure !== null && pressure > ALARM_PRESSION;
  const warnTemp    = !alarmTemp  && temp     !== null && temp     > WARN_TEMP;
  const warnPress   = !alarmPress && pressure !== null && pressure > WARN_PRESSION;

  const tempPct  = temp     !== null ? ((temp     - 35) / (50 - 35)) * 100 : 0;
  const pressPct = pressure !== null ? ((pressure - 10) / (25 - 10)) * 100 : 0;
  const freqPct  = freq     !== null ? ((freq     - 10) / (80 - 10)) * 100 : 0;

  return (
    <div style={S.app}>

      {/* ── En-tête ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>Z2</div>
          <div>
            <p style={S.title}>ONCF Z2M — Supervision VFD</p>
            <p style={S.subtitle}>
              Refroidissement moteur · Temps réel
              <span style={S.modeBadge(mode)}>
                {mode === "arduino" ? "🔌 Arduino" : "🔷 Simulation"}
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <div style={S.statusBadge(online)}>
            <span style={S.statusDot(online)} />
            {online ? "● TEMPS RÉEL" : "● HORS LIGNE"}
          </div>
          {lastUpdate && (
            <span style={{ fontSize: "11px", color: "#334155" }}>Dernière MAJ : {lastUpdate}</span>
          )}
        </div>
      </div>

      {/* ── 4 Cards capteurs ── */}
      <div style={S.grid}>

        {/* Température */}
        <SensorCard
          icon="🌡️"
          label="Température moteur"
          value={temp !== null ? temp.toFixed(1) : "--"}
          unit="°C"
          sub={`Seuil alarme : ${ALARM_TEMP}°C  |  LM35`}
          alarm={alarmTemp}
          warn={warnTemp}
          pct={tempPct}
          pctMin="35°C"
          pctMax="50°C"
        />

        {/* Pression */}
        <SensorCard
          icon="🔵"
          label="Pression HP"
          value={pressure !== null ? pressure.toFixed(1) : "--"}
          unit="Bar"
          sub={`Seuil alarme : ${ALARM_PRESSION} Bar  |  HX711`}
          alarm={alarmPress}
          warn={warnPress}
          pct={pressPct}
          pctMin="10 Bar"
          pctMax="25 Bar"
        />

        {/* Ventilateurs */}
        <SensorCard
          icon="💨"
          label="Ventilateurs actifs"
          value={motors}
          unit="/ 3"
          sub={motors === 0 ? "Arrêt — temp normale" : motors === 3 ? "Refroidissement max" : "Refroidissement partiel"}
          alarm={false}
          warn={false}
          extra={
            <div style={S.moteurs}>
              {[1, 2, 3].map(i => (
                <div key={i} style={S.moteurIcon(motors >= i)}>🌀</div>
              ))}
            </div>
          }
          pct={(motors / 3) * 100}
          pctMin="0"
          pctMax="3"
        />

        {/* Fréquence VFD */}
        <SensorCard
          icon="⚡"
          label="Fréquence VFD"
          value={freq !== null ? freq : "--"}
          unit="Hz"
          sub={`Calculée : (P / 25) × 80  |  Plage : 10–80 Hz`}
          alarm={false}
          warn={false}
          pct={freqPct}
          pctMin="10 Hz"
          pctMax="80 Hz"
        />

      </div>

      {/* ── Graphes historique ── */}
      <div style={S.historySection}>
        <div style={S.historyTitle}>📈 Historique — 30 dernières secondes</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
              Température (°C)
            </div>
            <MiniGraph data={history.temp}     color="#f87171" min={35} max={50} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
              Pression HP (Bar)
            </div>
            <MiniGraph data={history.pressure} color="#60a5fa" min={10} max={25} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
              Fréquence VFD (Hz)
            </div>
            <MiniGraph data={history.freq}     color="#a78bfa" min={10} max={80} />
          </div>
        </div>
      </div>

      {/* ── Alarme globale ── */}
      {(alarmTemp || alarmPress) && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.35)",
          borderRadius: "12px", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: "12px",
          marginBottom: "16px", animation: "alarmPulse 1s ease infinite",
        }}>
          <span style={{ fontSize: "24px" }}>🚨</span>
          <div>
            <div style={{ fontWeight: "600", color: "#f87171", fontSize: "14px" }}>
              ALARME ACTIVE — Intervention requise
            </div>
            <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "2px" }}>
              {alarmTemp  && `Température ${temp}°C > seuil ${ALARM_TEMP}°C   `}
              {alarmPress && `Pression ${pressure} Bar > seuil ${ALARM_PRESSION} Bar`}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={S.footer}>
        ONCF Z2M · Supervision Refroidissement VFD · PFE 2024-2025 · React {"{"}useState, useEffect{"}"} + FastAPI
      </div>

    </div>
  );
}
