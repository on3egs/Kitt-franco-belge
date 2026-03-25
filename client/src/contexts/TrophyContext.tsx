import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { computeLevel } from './UserContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserStats {
  videosSubmitted: number;
  totalViews: number;
  commentsCount: number;
  foldersCreated: number;
  viewsByVideo: Record<string, number>;
}

export interface TrophyDef {
  id: string;
  label: string;
  description: string;
  points: number;
  check: (stats: UserStats) => boolean;
  progress: (stats: UserStats) => number;
  max: number;
}

export interface TrophyStatus extends TrophyDef {
  unlocked: boolean;
}

// ─── Trophée definitions ──────────────────────────────────────────────────────

export const TROPHIES: TrophyDef[] = [
  {
    id: 'PREMIER_PAS',
    label: 'Premier Pas',
    description: 'Soumettre 1 vidéo',
    points: 50,
    check: (s) => s.videosSubmitted >= 1,
    progress: (s) => Math.min(s.videosSubmitted, 1),
    max: 1,
  },
  {
    id: 'CENT_VUES',
    label: 'Cent Vues',
    description: '100 vues totales',
    points: 100,
    check: (s) => s.totalViews >= 100,
    progress: (s) => Math.min(s.totalViews, 100),
    max: 100,
  },
  {
    id: 'ARCHIVISTE',
    label: 'Archiviste',
    description: 'Créer 1 dossier',
    points: 30,
    check: (s) => s.foldersCreated >= 1,
    progress: (s) => Math.min(s.foldersCreated, 1),
    max: 1,
  },
  {
    id: 'VIRAL',
    label: 'Viral',
    description: '1000 vues sur une seule vidéo',
    points: 200,
    check: (s) => Object.values(s.viewsByVideo).some((v) => v >= 1000),
    progress: (s) => Math.min(Math.max(...(Object.values(s.viewsByVideo).length ? Object.values(s.viewsByVideo) : [0])), 1000),
    max: 1000,
  },
  {
    id: 'COMMUNICATEUR',
    label: 'Communicateur',
    description: '10 commentaires postés',
    points: 50,
    check: (s) => s.commentsCount >= 10,
    progress: (s) => Math.min(s.commentsCount, 10),
    max: 10,
  },
  {
    id: 'LEGENDE',
    label: 'Légende',
    description: '10 000 vues totales',
    points: 500,
    check: (s) => s.totalViews >= 10000,
    progress: (s) => Math.min(s.totalViews, 10000),
    max: 10000,
  },
  {
    id: 'COLLECTIONNEUR',
    label: 'Collectionneur',
    description: '5 dossiers créés',
    points: 80,
    check: (s) => s.foldersCreated >= 5,
    progress: (s) => Math.min(s.foldersCreated, 5),
    max: 5,
  },
  {
    id: 'ASSIDU',
    label: 'Assidu',
    description: '500 vues totales',
    points: 150,
    check: (s) => s.totalViews >= 500,
    progress: (s) => Math.min(s.totalViews, 500),
    max: 500,
  },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

const EMPTY_STATS: UserStats = {
  videosSubmitted: 0,
  totalViews: 0,
  commentsCount: 0,
  foldersCreated: 0,
  viewsByVideo: {},
};

function statsKey(pseudo: string): string {
  return `kitt_stats_${pseudo}`;
}

function unlockedKey(pseudo: string): string {
  return `kitt_trophies_${pseudo}`;
}

function loadStats(pseudo: string | null): UserStats {
  if (!pseudo) return { ...EMPTY_STATS, viewsByVideo: {} };
  try {
    const raw = localStorage.getItem(statsKey(pseudo));
    if (!raw) return { ...EMPTY_STATS, viewsByVideo: {} };
    return JSON.parse(raw) as UserStats;
  } catch {
    return { ...EMPTY_STATS, viewsByVideo: {} };
  }
}

function saveStats(pseudo: string, stats: UserStats): void {
  try {
    localStorage.setItem(statsKey(pseudo), JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function loadUnlocked(pseudo: string | null): Set<string> {
  if (!pseudo) return new Set();
  try {
    const raw = localStorage.getItem(unlockedKey(pseudo));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveUnlocked(pseudo: string, unlocked: Set<string>): void {
  try {
    localStorage.setItem(unlockedKey(pseudo), JSON.stringify([...unlocked]));
  } catch {
    // ignore
  }
}

function computePoints(unlocked: Set<string>): number {
  return TROPHIES.filter((t) => unlocked.has(t.id)).reduce((sum, t) => sum + t.points, 0);
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface TrophyContextType {
  stats: UserStats;
  trophies: TrophyStatus[];
  totalPoints: number;
  level: number;
  incrementView: (videoId: string) => void;
  incrementComment: () => void;
  incrementSubmission: () => void;
  incrementFolderCreated: () => void;
  newTrophyNotification: TrophyDef | null;
  dismissNotification: () => void;
}

const TrophyContext = createContext<TrophyContextType | null>(null);

export function TrophyProvider({ children, pseudo }: { children: ReactNode; pseudo: string | null }) {
  const [stats, setStats] = useState<UserStats>(() => loadStats(pseudo));
  const [unlocked, setUnlocked] = useState<Set<string>>(() => loadUnlocked(pseudo));
  const [notification, setNotification] = useState<TrophyDef | null>(null);

  // Reload when user changes
  useEffect(() => {
    setStats(loadStats(pseudo));
    setUnlocked(loadUnlocked(pseudo));
    setNotification(null);
  }, [pseudo]);

  const applyStats = useCallback(
    (updated: UserStats) => {
      if (!pseudo) return;
      saveStats(pseudo, updated);
      setStats(updated);

      // Check newly unlocked trophies
      setUnlocked((prev) => {
        const next = new Set(prev);
        let firstNew: TrophyDef | null = null;
        for (const trophy of TROPHIES) {
          if (!next.has(trophy.id) && trophy.check(updated)) {
            next.add(trophy.id);
            if (!firstNew) firstNew = trophy;
          }
        }
        if (next.size !== prev.size) {
          saveUnlocked(pseudo, next);
          if (firstNew) setNotification(firstNew);
        }
        return next;
      });
    },
    [pseudo]
  );

  const incrementView = useCallback(
    (videoId: string) => {
      setStats((prev) => {
        const prevCount = prev.viewsByVideo[videoId] ?? 0;
        const updated: UserStats = {
          ...prev,
          totalViews: prev.totalViews + 1,
          viewsByVideo: { ...prev.viewsByVideo, [videoId]: prevCount + 1 },
        };
        applyStats(updated);
        return updated;
      });
    },
    [applyStats]
  );

  const incrementComment = useCallback(() => {
    setStats((prev) => {
      const updated: UserStats = { ...prev, commentsCount: prev.commentsCount + 1 };
      applyStats(updated);
      return updated;
    });
  }, [applyStats]);

  const incrementSubmission = useCallback(() => {
    setStats((prev) => {
      const updated: UserStats = { ...prev, videosSubmitted: prev.videosSubmitted + 1 };
      applyStats(updated);
      return updated;
    });
  }, [applyStats]);

  const incrementFolderCreated = useCallback(() => {
    setStats((prev) => {
      const updated: UserStats = { ...prev, foldersCreated: prev.foldersCreated + 1 };
      applyStats(updated);
      return updated;
    });
  }, [applyStats]);

  const dismissNotification = useCallback(() => setNotification(null), []);

  const trophies: TrophyStatus[] = TROPHIES.map((t) => ({
    ...t,
    unlocked: unlocked.has(t.id),
  }));

  const totalPoints = computePoints(unlocked);
  const level = computeLevel(totalPoints);

  return (
    <TrophyContext.Provider
      value={{
        stats,
        trophies,
        totalPoints,
        level,
        incrementView,
        incrementComment,
        incrementSubmission,
        incrementFolderCreated,
        newTrophyNotification: notification,
        dismissNotification,
      }}
    >
      {children}
    </TrophyContext.Provider>
  );
}

export function useTrophies(): TrophyContextType {
  const ctx = useContext(TrophyContext);
  if (!ctx) throw new Error('useTrophies must be used inside <TrophyProvider>');
  return ctx;
}

export default TrophyContext;
