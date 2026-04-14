import React from 'react';
import ReactDOM from 'react-dom/client';
import { RubixLoader } from '@samthomson/rubix-loader';
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
      styles: {
        root: { textTransform: 'none' },
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

const toastIconSize = 43;

const ToastRubixIcon = ({ color, speed = 0.9 }: { color: string; speed?: number }) => (
  <div
    style={{
      width: 50,
      height: 50,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      lineHeight: 0,
      flexShrink: 0,
    }}
  >
    <RubixLoader size={toastIconSize} colors={[color]} speed={speed} />
  </div>
);

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
              duration={7000}
              icons={{
                success: <ToastRubixIcon color="#22c55e" />,
                warning: <ToastRubixIcon color="#f59e0b" />,
                error: <ToastRubixIcon color="#ef4444" />,
                info: <ToastRubixIcon color="#3b82f6" />,
                loading: <ToastRubixIcon color="#a273f0" speed={1.15} />,
              }}
              toastOptions={{
                className: 'rk-toast',
                classNames: {
                  icon: 'rk-toast-icon',
                  content: 'rk-toast-content',
                },
              }}
            />
            <App />
          </RefreshServicesProvider>
        </DokployProvider>
      </AuthProvider>
    </MantineProvider>
  </React.StrictMode>
);

