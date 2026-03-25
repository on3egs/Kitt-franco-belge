/*
 * TrophyNotification — Notification flottante bottom-right, autofade 4s
 * Style: KITT K2000 — fond sombre, bordure dorée, texte doré, slide-in bas
 */

import { useEffect, useState } from "react";

interface TrophyNotificationProps {
  trophy: { emoji: string; name: string; points: number } | null;
  onDismiss: () => void;
}

export default function TrophyNotification({
  trophy,
  onDismiss,
}: TrophyNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [slidingOut, setSlidingOut] = useState(false);

  useEffect(() => {
    if (!trophy) {
      setVisible(false);
      setSlidingOut(false);
      return;
    }

    // Slide-in
    setVisible(false);
    setSlidingOut(false);
    const showTimer = setTimeout(() => setVisible(true), 20);

    // Début du fade-out à 3.4s
    const fadeTimer = setTimeout(() => setSlidingOut(true), 3400);

    // Dismiss à 4s
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 4000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [trophy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trophy) return null;

  /* ── Styles ─────────────────────────────────────────────────────────────── */

  const container: React.CSSProperties = {
    position: "fixed",
    bottom: 28,
    right: 24,
    zIndex: 9999,
    fontFamily: "'Courier New', Courier, monospace",
    transform: visible && !slidingOut
      ? "translateY(0)"
      : slidingOut
      ? "translateY(12px)"
      : "translateY(80px)",
    opacity: visible && !slidingOut ? 1 : 0,
    transition: slidingOut
      ? "opacity 0.5s ease, transform 0.5s ease"
      : "opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)",
    pointerEvents: visible ? "auto" : "none",
  };

  const card: React.CSSProperties = {
    background: "#0a0500",
    border: "2px solid #cc8800",
    boxShadow: "0 0 20px #cc880044, 0 4px 24px rgba(0,0,0,0.7)",
    borderRadius: 4,
    padding: "12px 16px",
    minWidth: 240,
    maxWidth: 320,
    position: "relative",
  };

  const topRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: 2,
    color: "#cc8800",
    textTransform: "uppercase",
    marginBottom: 2,
  };

  const nameStyle: React.CSSProperties = {
    fontSize: 14,
    letterSpacing: 1.5,
    color: "#ffcc44",
    textTransform: "uppercase",
    fontWeight: "bold",
  };

  const pointsStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#ffaa22",
    letterSpacing: 1,
    marginTop: 4,
  };

  const dismissBtn: React.CSSProperties = {
    position: "absolute",
    top: 6,
    right: 8,
    background: "none",
    border: "none",
    color: "#664400",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
    padding: "1px 4px",
    lineHeight: 1,
  };

  const separator: React.CSSProperties = {
    borderBottom: "1px solid #441800",
    margin: "8px 0",
  };

  /* Barre de progression autofade */
  const progressOuter: React.CSSProperties = {
    marginTop: 8,
    height: 3,
    background: "#331a00",
    borderRadius: 2,
    overflow: "hidden",
  };

  const progressFill: React.CSSProperties = {
    height: "100%",
    background: "#cc8800",
    transformOrigin: "left",
    animation: "kitt_trophy_progress 4s linear forwards",
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <>
      <style>{`
        @keyframes kitt_trophy_progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
      <div style={container}>
        <div style={card}>
          <button style={dismissBtn} onClick={onDismiss} title="Fermer">✕</button>

          <div style={topRow}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{trophy.emoji}</span>
            <div>
              <div style={labelStyle}>🏆 Trophée débloqué !</div>
              <div style={nameStyle}>{trophy.name}</div>
            </div>
          </div>

          <div style={separator} />

          <div style={pointsStyle}>
            + {trophy.points} points
            <span style={{ color: "#886622", marginLeft: 8, fontSize: 10 }}>
              ajoutés à votre score
            </span>
          </div>

          <div style={progressOuter}>
            <div style={progressFill} />
          </div>
        </div>
      </div>
    </>
  );
}
