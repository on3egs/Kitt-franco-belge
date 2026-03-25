import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'kitt_user';

function computeLevel(points: number): number {
  if (points >= 1500) return 10;
  if (points >= 1000) return 9;
  if (points >= 750)  return 8;
  if (points >= 550)  return 7;
  if (points >= 400)  return 6;
  if (points >= 280)  return 5;
  if (points >= 180)  return 4;
  if (points >= 100)  return 3;
  if (points >= 40)   return 2;
  return 1;
}

interface UserContextType {
  pseudo: string | null;
  isLoggedIn: boolean;
  points: number;
  level: number;
  login: (pseudo: string) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const totalPoints = 0; // level calculé via TrophyContext
  const [pseudo, setPseudo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  });

  const login = useCallback((newPseudo: string) => {
    const trimmed = newPseudo.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // localStorage unavailable — continue in-memory
    }
    setPseudo(trimmed);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setPseudo(null);
  }, []);

  const level = computeLevel(totalPoints);

  return (
    <UserContext.Provider value={{ pseudo, isLoggedIn: pseudo !== null, points: totalPoints, level, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}

export { computeLevel };
export default UserContext;
