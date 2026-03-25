import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Folder {
  id: string;
  name: string;
  isPublic: boolean;
  videoIds: string[];
  createdAt: string;
}

interface FolderContextType {
  folders: Folder[];
  createFolder: (name: string) => Folder | null;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  addVideoToFolder: (folderId: string, videoId: string) => void;
  removeVideoFromFolder: (folderId: string, videoId: string) => void;
  toggleFolderPublic: (id: string) => void;
  isVideoInFolder: (folderId: string, videoId: string) => boolean;
}

const FolderContext = createContext<FolderContextType | null>(null);

function storageKey(pseudo: string): string {
  return `kitt_folders_${pseudo}`;
}

function loadFolders(pseudo: string | null): Folder[] {
  if (!pseudo) return [];
  try {
    const raw = localStorage.getItem(storageKey(pseudo));
    if (!raw) return [];
    return JSON.parse(raw) as Folder[];
  } catch {
    return [];
  }
}

function saveFolders(pseudo: string, folders: Folder[]): void {
  try {
    localStorage.setItem(storageKey(pseudo), JSON.stringify(folders));
  } catch {
    // ignore quota / unavailability errors
  }
}

function generateId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function FolderProvider({ children, pseudo }: { children: ReactNode; pseudo: string | null }) {
  const [folders, setFolders] = useState<Folder[]>(() => loadFolders(pseudo));

  // Reload folders when pseudo changes (login / logout)
  React.useEffect(() => {
    setFolders(loadFolders(pseudo));
  }, [pseudo]);

  const persist = useCallback(
    (updated: Folder[]) => {
      if (pseudo) saveFolders(pseudo, updated);
      setFolders(updated);
    },
    [pseudo]
  );

  const createFolder = useCallback(
    (name: string): Folder | null => {
      if (!pseudo) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      const folder: Folder = {
        id: generateId(),
        name: trimmed,
        isPublic: false,
        videoIds: [],
        createdAt: new Date().toISOString(),
      };
      persist([...folders, folder]);
      return folder;
    },
    [pseudo, folders, persist]
  );

  const deleteFolder = useCallback(
    (id: string) => {
      persist(folders.filter((f) => f.id !== id));
    },
    [folders, persist]
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    },
    [folders, persist]
  );

  const addVideoToFolder = useCallback(
    (folderId: string, videoId: string) => {
      persist(
        folders.map((f) =>
          f.id === folderId && !f.videoIds.includes(videoId)
            ? { ...f, videoIds: [...f.videoIds, videoId] }
            : f
        )
      );
    },
    [folders, persist]
  );

  const removeVideoFromFolder = useCallback(
    (folderId: string, videoId: string) => {
      persist(
        folders.map((f) =>
          f.id === folderId
            ? { ...f, videoIds: f.videoIds.filter((v) => v !== videoId) }
            : f
        )
      );
    },
    [folders, persist]
  );

  const toggleFolderPublic = useCallback(
    (id: string) => {
      persist(folders.map((f) => (f.id === id ? { ...f, isPublic: !f.isPublic } : f)));
    },
    [folders, persist]
  );

  const isVideoInFolder = useCallback(
    (folderId: string, videoId: string): boolean => {
      const folder = folders.find((f) => f.id === folderId);
      return folder ? folder.videoIds.includes(videoId) : false;
    },
    [folders]
  );

  return (
    <FolderContext.Provider
      value={{
        folders,
        createFolder,
        deleteFolder,
        renameFolder,
        addVideoToFolder,
        removeVideoFromFolder,
        toggleFolderPublic,
        isVideoInFolder,
      }}
    >
      {children}
    </FolderContext.Provider>
  );
}

export function useFolders(): FolderContextType {
  const ctx = useContext(FolderContext);
  if (!ctx) throw new Error('useFolders must be used inside <FolderProvider>');
  return ctx;
}

export default FolderContext;
