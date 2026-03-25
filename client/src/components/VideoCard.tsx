/*
 * VideoCard — Carte vidéo réutilisable, thème KITT K2000
 * Thumbnail YouTube, stats vues, bouton ajout dossier
 */

import { useState } from "react";

interface VideoCardProps {
  id: string;
  title: string;
  youtubeId: string;
  globalViews: number;
  myViews?: number;
  isInFolder?: boolean;
  onAddToFolder?: () => void;
  onView?: () => void;
}

export default function VideoCard({
  title,
  youtubeId,
  globalViews,
  myViews,
  isInFolder,
  onAddToFolder,
  onView,
}: VideoCardProps) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const thumbUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;

  /* ── Styles ─────────────────────────────────────────────────────────────── */

  const card: React.CSSProperties = {
    background: hovered ? "#0e0000" : "#080000",
    border: `1px solid ${hovered ? "#550000" : "#330000"}`,
    borderRadius: 4,
    overflow: "hidden",
    fontFamily: "'Courier New', Courier, monospace",
    boxShadow: hovered
      ? "0 0 14px #ff000033, 0 2px 12px rgba(0,0,0,0.6)"
      : "0 2px 8px rgba(0,0,0,0.4)",
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
  };

  const thumbWrapper: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    background: "#0a0000",
    overflow: "hidden",
  };

  const thumbImg: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: imgError ? "none" : "block",
    transition: "opacity 0.2s",
    opacity: hovered ? 0.85 : 1,
  };

  const thumbFallback: React.CSSProperties = {
    display: imgError ? "flex" : "none",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    color: "#330000",
    fontSize: 32,
  };

  const playOverlay: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.35)",
    opacity: hovered ? 1 : 0,
    transition: "opacity 0.2s",
    pointerEvents: "none",
  };

  const playIcon: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "#cc000088",
    border: "2px solid #ff2222",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    color: "#fff",
    boxShadow: "0 0 12px #ff000066",
  };

  const folderBadge: React.CSSProperties = {
    position: "absolute",
    top: 6,
    right: 6,
    background: "#cc660088",
    border: "1px solid #884400",
    borderRadius: 2,
    fontSize: 10,
    color: "#ffaa44",
    padding: "2px 5px",
    fontFamily: "inherit",
  };

  const body: React.CSSProperties = {
    padding: "8px 10px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#ff4444",
    letterSpacing: 0.8,
    lineHeight: 1.4,
    textTransform: "uppercase",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  };

  const statsRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
    paddingTop: 4,
    borderTop: "1px solid #1a0000",
  };

  const viewsStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#884422",
    letterSpacing: 0.5,
  };

  const myViewsStyle: React.CSSProperties = {
    fontSize: 10,
    color: "#553311",
    marginLeft: 6,
  };

  const folderBtn: React.CSSProperties = {
    background: "none",
    border: "1px solid #440000",
    color: "#cc4400",
    cursor: "pointer",
    fontSize: 10,
    padding: "3px 7px",
    borderRadius: 2,
    fontFamily: "inherit",
    letterSpacing: 0.5,
    transition: "border-color 0.15s, color 0.15s",
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const handleClick = () => {
    if (onView) onView();
    // Ouvrir YouTube dans un nouvel onglet
    window.open(`https://www.youtube.com/watch?v=${youtubeId}`, "_blank", "noopener");
  };

  return (
    <div
      style={card}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div style={thumbWrapper} onClick={handleClick}>
        <img
          src={thumbUrl}
          alt={title}
          style={thumbImg}
          onError={() => setImgError(true)}
          loading="lazy"
        />
        <div style={thumbFallback}>▶</div>
        <div style={playOverlay}>
          <div style={playIcon}>▶</div>
        </div>
        {isInFolder && (
          <span style={folderBadge}>📁</span>
        )}
      </div>

      {/* Corps */}
      <div style={body}>
        <div style={titleStyle} title={title}>
          {title}
        </div>

        <div style={statsRow}>
          <div style={viewsStyle}>
            👁 {globalViews.toLocaleString("fr-FR")} vues
            {myViews !== undefined && myViews > 0 && (
              <span style={myViewsStyle}>(moi&nbsp;: {myViews})</span>
            )}
          </div>

          {onAddToFolder && (
            <button
              style={folderBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAddToFolder();
              }}
              title="Ajouter à un dossier"
            >
              📁 Ajouter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
