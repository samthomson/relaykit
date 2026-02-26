import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { DokployProvider } from './contexts/DokployContext';
import { RefreshServicesProvider } from './contexts/RefreshServicesContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <DokployProvider>
        <RefreshServicesProvider>
          <Toaster position="top-right" richColors />
          <App />
        </RefreshServicesProvider>
      </DokployProvider>
    </AuthProvider>
  </React.StrictMode>
);

