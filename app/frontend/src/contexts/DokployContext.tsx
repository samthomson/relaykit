import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { trpc } from '../trpc';
import { useAuth } from './AuthContext';

type DokployStatus = { hasApiKey?: boolean; reachable?: boolean; error?: string } | null;

const DokployContext = createContext<{
  dokployStatus: DokployStatus;
  loading: boolean;
  checkDokploy: () => Promise<void>;
  /** Set when listServices or other Dokploy calls fail (e.g. invalid API key). Show banner only. */
  dokployConnectionError: string | null;
  setDokployConnectionError: (msg: string | null) => void;
  /** True after at least one successful listServices. Only then show deploy UI. */
  dokployReady: boolean;
  setDokployReady: (v: boolean) => void;
} | null>(null);

export const DokployProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [dokployStatus, setDokployStatus] = useState<DokployStatus>(null);
  const [loading, setLoading] = useState(false);
  const [dokployConnectionError, setDokployConnectionError] = useState<string | null>(null);
  const [dokployReady, setDokployReady] = useState(false);

  const checkDokploy = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.checkDokploy.query();
      setDokployStatus({
        hasApiKey: result.hasApiKey,
        reachable: result.reachable,
        error: 'error' in result ? result.error : undefined,
      });
    } catch (error: any) {
      setDokployStatus({ error: error?.message || 'Could not reach Dokploy' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) checkDokploy();
    else {
      setDokployStatus(null);
      setDokployReady(false);
    }
  }, [isAuthenticated, checkDokploy]);

  return (
    <DokployContext.Provider value={{ dokployStatus, loading, checkDokploy, dokployConnectionError, setDokployConnectionError, dokployReady, setDokployReady }}>
      {children}
    </DokployContext.Provider>
  );
};

export const useDokploy = () => {
  const ctx = useContext(DokployContext);
  if (!ctx) throw new Error('useDokploy must be used within DokployProvider');
  return ctx;
};
