import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { GoogleUser } from '../lib/sea-auth';
import {
  fetchGoogleUser,
  authenticateWithSEA,
  logout as authLogout,
  redirectToGoogleAuth,
} from '../lib/sea-auth';

interface AuthContextType {
  googleUser: GoogleUser | null;
  seaPub: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuthProvider() {
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [seaPub, setSeaPub] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!googleUser && !!seaPub;

  // Check auth on mount and after OAuth redirect
  useEffect(() => {
    async function checkAuth() {
      setIsLoading(true);

      try {
        // Check for auth success in URL (OAuth redirect)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('auth') === 'success') {
          // Clean up URL
          window.history.replaceState({}, document.title, '/');
        }

        // Fetch Google user from session
        const user = await fetchGoogleUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        setGoogleUser(user);

        // Authenticate with SEA
        const pub = await authenticateWithSEA();
        setSeaPub(pub);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = useCallback(() => {
    redirectToGoogleAuth();
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setGoogleUser(null);
    setSeaPub(null);
  }, []);

  return {
    googleUser,
    seaPub,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}

export const AuthProvider = AuthContext.Provider;

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
