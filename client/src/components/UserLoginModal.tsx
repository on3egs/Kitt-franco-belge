import React, { useState, useCallback, CSSProperties } from 'react';
import { useUser } from '../contexts/UserContext';

// ─── Validation ───────────────────────────────────────────────────────────────

const PSEUDO_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

function validatePseudo(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 3) return 'Minimum 3 caractères.';
  if (trimmed.length > 20) return 'Maximum 20 caractères.';
  if (!PSEUDO_REGEX.test(trimmed)) return 'Lettres, chiffres et _ uniquement.';
  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9000,
};

const modal: CSSProperties = {
  background: '#0a0000',
  border: '1px solid #440000',
  boxShadow: '0 0 24px #ff000033',
  padding: '32px 40px',
  minWidth: '320px',
  maxWidth: '420px',
  width: '100%',
  fontFamily: '"Courier New", Courier, monospace',
  color: '#ff4444',
  position: 'relative',
};

const title: CSSProperties = {
  fontSize: '1rem',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  marginBottom: '24px',
  borderBottom: '1px solid #440000',
  paddingBottom: '12px',
};

const inputStyle: CSSProperties = {
  background: '#000',
  border: '1px solid #440000',
  color: '#ff4444',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '1rem',
  padding: '8px 12px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  marginBottom: '8px',
  letterSpacing: '0.05em',
};

const errorStyle: CSSProperties = {
  color: '#ff6666',
  fontSize: '0.8rem',
  marginBottom: '16px',
  minHeight: '1.2em',
};

const btn: CSSProperties = {
  background: '#1a0000',
  border: '1px solid #cc2222',
  color: '#ff4444',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '0.9rem',
  letterSpacing: '0.15em',
  padding: '10px 24px',
  cursor: 'pointer',
  width: '100%',
  textTransform: 'uppercase',
  transition: 'background 0.2s, box-shadow 0.2s',
};

const closeBtn: CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '16px',
  background: 'transparent',
  border: 'none',
  color: '#660000',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '1rem',
  cursor: 'pointer',
  letterSpacing: '0.05em',
};

const connectedBox: CSSProperties = {
  border: '1px solid #440000',
  padding: '12px 16px',
  marginBottom: '20px',
  fontSize: '0.9rem',
  letterSpacing: '0.08em',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface UserLoginModalProps {
  onClose: () => void;
}

export default function UserLoginModal({ onClose }: UserLoginModalProps) {
  const { pseudo, isLoggedIn, login, logout } = useUser();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  const handleLogin = useCallback(() => {
    const err = validatePseudo(input);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    login(input.trim());
    onClose();
  }, [input, login, onClose]);

  const handleLogout = useCallback(() => {
    logout();
    onClose();
  }, [logout, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleLogin();
    },
    [handleLogin]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <div style={overlay} onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div style={modal}>
        <button style={closeBtn} onClick={onClose} aria-label="Fermer">
          [X]
        </button>

        <div style={title}>// IDENTIFICATION KITT</div>

        {isLoggedIn ? (
          <>
            <div style={connectedBox}>
              UTILISATEUR ACTIF :<br />
              <span style={{ color: '#ff8888', letterSpacing: '0.12em' }}>{pseudo}</span>
            </div>
            <button
              style={{ ...btn, ...(hover ? { background: '#330000', boxShadow: '0 0 8px #ff000044' } : {}) }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onClick={handleLogout}
            >
              [ DÉCONNEXION ]
            </button>
          </>
        ) : (
          <>
            <label style={{ fontSize: '0.8rem', letterSpacing: '0.12em', display: 'block', marginBottom: '8px' }}>
              ENTREZ VOTRE PSEUDO :
            </label>
            <input
              style={inputStyle}
              type="text"
              value={input}
              maxLength={20}
              autoFocus
              placeholder="pseudo_kitt"
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              aria-label="Pseudo"
            />
            <div style={errorStyle}>{error ?? ' '}</div>
            <button
              style={{ ...btn, ...(hover ? { background: '#330000', boxShadow: '0 0 8px #ff000044' } : {}) }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onClick={handleLogin}
            >
              [ CONNEXION ]
            </button>
          </>
        )}
      </div>
    </div>
  );
}
