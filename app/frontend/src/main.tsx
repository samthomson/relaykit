import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@mantine/charts/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { DokployProvider } from './contexts/DokployContext';
import { RefreshServicesProvider } from './contexts/RefreshServicesContext';

const theme = createTheme({
  primaryColor: 'relaykit',
  defaultRadius: 0,
  colors: {
    relaykit: [
      '#f4efff',
      '#e9dcff',
      '#d9c2ff',
      '#c7a6ff',
      '#b58aff',
      '#a273f0',
      '#9368d8',
      '#7f58b8',
      '#6b4a97',
      '#563d78',
    ],
  },
  fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  components: {
    Badge: {
      defaultProps: {
        radius: 0,
      },
    },
    Notification: {
      defaultProps: {
        radius: 0,
        color: 'relaykit',
        withBorder: true,
      },
    },
    SegmentedControl: {
      defaultProps: {
        color: 'relaykit',
      },
    },
    NavLink: {
      defaultProps: {
        variant: 'light',
        color: 'relaykit',
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <AuthProvider>
        <DokployProvider>
          <RefreshServicesProvider>
            <Notifications position="top-right" />
            <Toaster
              position="top-right"
              richColors={false}
              toastOptions={{
                className: 'rk-toast',
              }}
            />
            <App />
          </RefreshServicesProvider>
        </DokployProvider>
      </AuthProvider>
    </MantineProvider>
  </React.StrictMode>
);

