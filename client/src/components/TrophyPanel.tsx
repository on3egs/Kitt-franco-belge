/*
 * TrophyPanel — Tableau des trophées KITT avec barres de progression
 * Style: KITT K2000 — fond noir, rouge/vert/doré, monospace rétro-futuriste
 */

interface TrophyStatus {
  id: string;
  emoji: string;
  name: string;
  description: string;
  points: number;
  unlocked: boolean;
  progressValue: number;
  max: number;
}

interface TrophyPanelProps {
  pseudo: string;
  trophies: TrophyStatus[];
  totalPoints: number;
  level: number;
  onClose: () => void;
}

function LevelBar({ level, totalPoints }: { level: number; totalPoints: number }) {
  // Chaque niveau = 200 pts, barre = progression vers niveau suivant
  const pointsPerLevel = 200;
  const pointsInLevel = totalPoints % pointsPerLevel;
  const pct = Math.min(100, Math.round((pointsInLevel / pointsPerLevel) * 100));
  const filledBlocks = Math.round(pct / 10);

  const bar = Array.from({ length: 10 }, (_, i) => i < filledBlocks ? "▬" : "░").join("");

  return (
    <span style={{ fontFamily: "inherit", color: "#cc4400", fontSize: 12 }}>
      <span style={{ color: "#ff6622" }}>{bar}</span>
      <span style={{ color: "#553311", marginLeft: 6 }}>{pct}%</span>
    </span>
  );
}

function ProgressBar({ progress, max }: { progress: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((progress / max) * 100)) : 0;
  const totalBlocks = 14;
  const filled = Math.round((pct / 100) * totalBlocks);

  const color = pct >= 80 ? "#ff6600" : pct >= 50 ? "#cc4400" : "#882200";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <div
        style={{
          width: 120,
          height: 8,
          background: "#1a0000",
          border: "1px solid #330000",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: `linear-gradient(90deg, #550000, ${color})`,
            boxShadow: `0 0 4px ${color}88`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: "#664422", fontFamily: "inherit" }}>
        {progress}/{max}
      </span>
    </div>
  );
}

export default function TrophyPanel({
  pseudo,
  trophies,
  totalPoints,
  level,
  onClose,
}: TrophyPanelProps) {
  /* ── Styles ─────────────────────────────────────────────────────────────── */

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.76)",
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Courier New', Courier, monospace",
  };

  const panel: React.CSSProperties = {
    background: "#050000",
    border: "2px solid #330000",
    boxShadow: "0 0 28px #ff000033, inset 0 0 10px #1a000088",
    borderRadius: 4,
    width: "min(560px, 96vw)",
    maxHeight: "82vh",
    overflowY: "auto",
    color: "#cc3300",
    padding: "0 0 16px",
  };

  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px 10px",
    borderBottom: "1px solid #330000",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 13,
    letterSpacing: 2,
    color: "#ff4444",
    textTransform: "uppercase",
  };

  const statsRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "8px 18px 10px",
    borderBottom: "1px solid #330000",
    fontSize: 12,
    flexWrap: "wrap",
  };

  const btnClose: React.CSSProperties = {
    background: "none",
    border: "1px solid #440000",
    color: "#cc2200",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 8px",
    borderRadius: 2,
    fontFamily: "inherit",
  };

  const trophyCard = (unlocked: boolean): React.CSSProperties => ({
    margin: "6px 12px",
    padding: "10px 14px",
    background: unlocked ? "#021000" : "#080000",
    border: `1px solid ${unlocked ? "#224400" : "#1a0000"}`,
    borderRadius: 3,
    opacity: unlocked ? 1 : 0.7,
    boxShadow: unlocked ? "0 0 6px #00440022" : "none",
  });

  const trophyHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const trophyName = (unlocked: boolean): React.CSSProperties => ({
    flex: 1,
    fontSize: 13,
    letterSpacing: 1,
    color: unlocked ? "#44cc22" : "#444444",
    textTransform: "uppercase",
  });

  const trophyPoints = (unlocked: boolean): React.CSSProperties => ({
    fontSize: 11,
    color: unlocked ? "#88cc44" : "#333333",
    letterSpacing: 1,
  });

  const trophyBadge = (unlocked: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "2px 6px",
    border: `1px solid ${unlocked ? "#33660033" : "#22000033"}`,
    borderRadius: 2,
    color: unlocked ? "#44cc22" : "#333333",
    background: unlocked ? "#0a1800" : "transparent",
    letterSpacing: 1,
  });

  const trophyDesc: React.CSSProperties = {
    fontSize: 10,
    color: "#553322",
    marginTop: 4,
    letterSpacing: 0.5,
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const unlockedCount = trophies.filter((t) => t.unlocked).length;

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <span style={titleStyle}>🏆 TROPHÉES — {pseudo.toUpperCase()}</span>
          <button style={btnClose} onClick={onClose}>✕</button>
        </div>

        {/* Stats */}
        <div style={statsRow}>
          <span>
            <span style={{ color: "#cc8800" }}>Points :</span>
            <span style={{ color: "#ffaa00", marginLeft: 6, fontWeight: "bold" }}>
              {totalPoints}
            </span>
          </span>
          <span>
            <span style={{ color: "#886633" }}>Niveau</span>
            <span style={{ color: "#ffaa00", margin: "0 8px" }}>{level}</span>
            <LevelBar level={level} totalPoints={totalPoints} />
          </span>
          <span style={{ color: "#554422", fontSize: 11 }}>
            {unlockedCount}/{trophies.length} débloqués
          </span>
        </div>

        {/* Séparateur */}
        <div style={{ borderBottom: "1px solid #220000", margin: "0 0 4px" }} />

        {/* Trophées */}
        {trophies.length === 0 && (
          <div style={{ padding: "16px 18px", color: "#442200", fontSize: 12 }}>
            — Aucun trophée disponible —
          </div>
        )}

        {trophies.map((trophy) => (
          <div key={trophy.id} style={trophyCard(trophy.unlocked)}>
            <div style={trophyHeader}>
              <span style={{ fontSize: 20 }}>{trophy.emoji}</span>
              <span style={trophyName(trophy.unlocked)}>{trophy.name}</span>
              <span style={trophyPoints(trophy.unlocked)}>+{trophy.points} pts</span>
              <span style={trophyBadge(trophy.unlocked)}>
                {trophy.unlocked ? "DÉBLOQUÉ" : "VERROUILLÉ"}
              </span>
              {trophy.unlocked && (
                <span style={{ fontSize: 14, marginLeft: 4 }}>✅</span>
              )}
            </div>

            <div style={trophyDesc}>{trophy.description}</div>

            {!trophy.unlocked && trophy.max > 0 && (
              <ProgressBar progress={trophy.progressValue} max={trophy.max} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
