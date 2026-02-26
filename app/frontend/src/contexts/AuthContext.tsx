import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { checkNostrExtension, getNostrPublicKey, signNostrChallenge } from '../lib/nostr';

interface AuthContextType {
  isAuthenticated: boolean;
  npub: string | null;
  token: string | null;
  hasNostrExtension: boolean;
  login: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [npub, setNpub] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasNostrExtension, setHasNostrExtension] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedToken = localStorage.getItem('relaykit_token');
    const storedNpub = localStorage.getItem('relaykit_npub');

    if (storedToken && storedNpub) {
      // Verify token is still valid
      fetch('/auth/verify', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (res.ok) {
            setToken(storedToken);
            setNpub(storedNpub);
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('relaykit_token');
            localStorage.removeItem('relaykit_npub');
          }
        })
        .catch(() => {
          localStorage.removeItem('relaykit_token');
          localStorage.removeItem('relaykit_npub');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }

    // Check for Nostr extension
    checkNostrExtension().then(setHasNostrExtension);
  }, []);

  const login = async () => {
    try {
      setIsLoading(true);

      // Get public key from Nostr extension
      const pubkey = await getNostrPublicKey();

      // Request challenge from backend
      const challengeRes = await fetch('/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npub: pubkey }),
      });

      if (!challengeRes.ok) {
        throw new Error('Failed to get challenge');
      }

      const { challenge } = await challengeRes.json();

      // Sign challenge with Nostr extension
      const signedEvent = await signNostrChallenge(challenge);

      // Send signed event to backend
      const loginRes = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: signedEvent }),
      });

      if (!loginRes.ok) {
        const error = await loginRes.json();
        throw new Error(error.error || 'Login failed');
      }

      const { token: newToken, npub: newNpub } = await loginRes.json();

      // Store in localStorage
      localStorage.setItem('relaykit_token', newToken);
      localStorage.setItem('relaykit_npub', newNpub);

      setToken(newToken);
      setNpub(newNpub);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('relaykit_token');
    localStorage.removeItem('relaykit_npub');
    setToken(null);
    setNpub(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        npub,
        token,
        hasNostrExtension,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
