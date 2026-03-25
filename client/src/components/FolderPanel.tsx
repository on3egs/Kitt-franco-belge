/*
 * FolderPanel — Arborescence des dossiers personnels
 * Style: KITT K2000 — fond noir, rouge sombre, monospace rétro-futuriste
 */

import { useState } from "react";

interface Folder {
  id: string;
  name: string;
  isPublic: boolean;
  videoIds: string[];
}

interface FolderPanelProps {
  pseudo: string;
  folders: Folder[];
  currentVideoId?: string;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onAddVideo: (folderId: string, videoId: string) => void;
  onRemoveVideo: (folderId: string, videoId: string) => void;
  onTogglePublic: (id: string) => void;
  onClose: () => void;
}

export default function FolderPanel({
  pseudo,
  folders,
  currentVideoId,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onRemoveVideo,
  onTogglePublic,
  onClose,
}: FolderPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderInput, setNewFolderInput] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) onRenameFolder(id, renameValue.trim());
    setRenamingId(null);
  };

  const commitCreate = () => {
    if (newFolderInput.trim()) {
      onCreateFolder(newFolderInput.trim());
      setNewFolderInput("");
      setShowNewInput(false);
    }
  };

  /* ── Styles ────────────────────────────────────────────────────────────── */

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.72)",
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Courier New', Courier, monospace",
  };

  const panel: React.CSSProperties = {
    background: "#050000",
    border: "2px solid #330000",
    boxShadow: "0 0 24px #ff000033, inset 0 0 8px #1a000088",
    borderRadius: 4,
    width: "min(520px, 96vw)",
    maxHeight: "80vh",
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

  const title: React.CSSProperties = {
    fontSize: 13,
    letterSpacing: 2,
    color: "#ff4444",
    textTransform: "uppercase",
  };

  const separator: React.CSSProperties = {
    borderBottom: "1px solid #330000",
    margin: "0 18px 8px",
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

  const btnNew: React.CSSProperties = {
    display: "block",
    margin: "8px 18px",
    background: "#110000",
    border: "1px solid #440000",
    color: "#cc3300",
    cursor: "pointer",
    fontSize: 12,
    letterSpacing: 1,
    padding: "6px 14px",
    borderRadius: 2,
    fontFamily: "inherit",
    textTransform: "uppercase",
  };

  const newFolderRow: React.CSSProperties = {
    display: "flex",
    gap: 6,
    margin: "6px 18px 10px",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: "#0a0000",
    border: "1px solid #550000",
    color: "#ff4444",
    fontFamily: "inherit",
    fontSize: 12,
    padding: "4px 8px",
    outline: "none",
    borderRadius: 2,
  };

  const btnSmall = (color = "#cc2200"): React.CSSProperties => ({
    background: "none",
    border: `1px solid ${color}44`,
    color,
    cursor: "pointer",
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 2,
    fontFamily: "inherit",
    marginLeft: 4,
  });

  const folderRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "6px 18px",
    cursor: "pointer",
    borderBottom: "1px solid #1a0000",
    gap: 6,
  };

  const folderName: React.CSSProperties = {
    flex: 1,
    fontSize: 13,
    color: "#cc3300",
    letterSpacing: 1,
  };

  const videoItem = (highlight: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "4px 18px 4px 44px",
    borderBottom: "1px solid #0f0000",
    background: highlight ? "#1a0800" : "transparent",
  });

  const videoText: React.CSSProperties = {
    flex: 1,
    fontSize: 11,
    color: "#886655",
    letterSpacing: 0.5,
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <span style={title}>📁 DOSSIERS DE : {pseudo.toUpperCase()}</span>
          <button style={btnClose} onClick={onClose}>✕</button>
        </div>
        <div style={separator} />

        {/* Nouveau dossier */}
        <button style={btnNew} onClick={() => setShowNewInput((v) => !v)}>
          + NOUVEAU DOSSIER
        </button>
        {showNewInput && (
          <div style={newFolderRow}>
            <input
              style={inputStyle}
              value={newFolderInput}
              onChange={(e) => setNewFolderInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitCreate()}
              placeholder="Nom du dossier..."
              autoFocus
            />
            <button style={btnSmall("#44cc22")} onClick={commitCreate}>OK</button>
            <button style={btnSmall("#884422")} onClick={() => setShowNewInput(false)}>✕</button>
          </div>
        )}

        {/* Liste des dossiers */}
        {folders.length === 0 && (
          <div style={{ padding: "12px 18px", color: "#442200", fontSize: 12 }}>
            — Aucun dossier créé —
          </div>
        )}
        {folders.map((folder) => {
          const isExpanded = expandedIds.has(folder.id);
          const isRenaming = renamingId === folder.id;
          const count = folder.videoIds.length;
          const label = count === 1 ? "1 vidéo" : `${count} vidéos`;

          return (
            <div key={folder.id}>
              {/* Ligne dossier */}
              <div style={folderRow}>
                <span
                  style={{ fontSize: 11, color: "#663300", minWidth: 12 }}
                  onClick={() => toggleExpand(folder.id)}
                >
                  {isExpanded ? "▾" : "▸"}
                </span>
                <span
                  style={{ fontSize: 14, cursor: "pointer" }}
                  onClick={() => toggleExpand(folder.id)}
                >
                  📂
                </span>

                {isRenaming ? (
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(folder.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(folder.id)}
                  />
                ) : (
                  <span
                    style={{ ...folderName, cursor: "pointer" }}
                    onClick={() => toggleExpand(folder.id)}
                  >
                    {folder.name}
                    <span style={{ color: "#553322", fontSize: 11, marginLeft: 6 }}>
                      ({label})
                    </span>
                  </span>
                )}

                {/* Actions dossier */}
                <button
                  style={btnSmall(folder.isPublic ? "#cc8800" : "#446688")}
                  title={folder.isPublic ? "Rendre privé" : "Rendre public"}
                  onClick={() => onTogglePublic(folder.id)}
                >
                  {folder.isPublic ? "🔓" : "🔒"}
                </button>
                <button
                  style={btnSmall("#aa6622")}
                  title="Renommer"
                  onClick={() => startRename(folder)}
                >
                  ✏
                </button>
                <button
                  style={btnSmall("#880000")}
                  title="Supprimer"
                  onClick={() => onDeleteFolder(folder.id)}
                >
                  ✕
                </button>
              </div>

              {/* Contenu du dossier */}
              {isExpanded && (
                <>
                  {folder.videoIds.length === 0 && (
                    <div style={{ ...videoItem(false), color: "#442200", fontSize: 11 }}>
                      └── (vide)
                    </div>
                  )}
                  {folder.videoIds.map((vid, i) => {
                    const isLast = i === folder.videoIds.length - 1;
                    const highlight = vid === currentVideoId;
                    return (
                      <div key={vid} style={videoItem(highlight)}>
                        <span style={{ color: "#443322", fontSize: 11, marginRight: 6 }}>
                          {isLast ? "└──" : "├──"}
                        </span>
                        <span style={videoText}>
                          {highlight && <span style={{ color: "#ff6600" }}>▶ </span>}
                          {vid}
                        </span>
                        <button
                          style={btnSmall("#770000")}
                          onClick={() => onRemoveVideo(folder.id, vid)}
                        >
                          ✕ Retirer
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
