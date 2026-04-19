import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { trpc } from '../trpc';
import { useAuth } from './AuthContext';

type RefreshServicesContextValue = {
  refreshTrigger: number;
  triggerRefresh: () => void;
  services: any[];
  servicesLoading: boolean;
  servicesError: string | null;
};

const RefreshServicesContext = createContext<RefreshServicesContextValue | null>(null);

export const RefreshServicesProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, logout } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [services, setServices] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const triggerRefresh = useCallback(() => setRefreshTrigger((n) => n + 1), []);

  useEffect(() => {
    if (!isAuthenticated) {
      setServices([]);
      setServicesLoading(false);
      setServicesError(null);
      return;
    }

    let mounted = true;
    setServicesLoading(true);
    trpc.listServices
      .query()
      .then((nextServices) => {
        if (!mounted) return;
        setServices(Array.isArray(nextServices) ? nextServices : []);
        setServicesError(null);
      })
      .catch((error: any) => {
        if (!mounted) return;
        const code = error?.data?.code;
        const msg = error?.message || '';
        if (code === 'UNAUTHORIZED' && msg.includes('Authentication required')) {
          logout();
          return;
        }
        setServices([]);
        setServicesError(msg || 'Could not load services. Run the setup script (see README).');
      })
      .finally(() => {
        if (!mounted) return;
        setServicesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, refreshTrigger, logout]);

  const value = useMemo(
    () => ({ refreshTrigger, triggerRefresh, services, servicesLoading, servicesError }),
    [refreshTrigger, triggerRefresh, services, servicesLoading, servicesError],
  );

  return (
    <RefreshServicesContext.Provider value={value}>
      {children}
    </RefreshServicesContext.Provider>
  );
};

export const useRefreshServices = () => {
  const ctx = useContext(RefreshServicesContext);
  if (!ctx) throw new Error('useRefreshServices must be used within RefreshServicesProvider');
  return ctx;
};
