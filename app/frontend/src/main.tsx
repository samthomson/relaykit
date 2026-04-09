import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { DokployProvider } from './contexts/DokployContext';
import { RefreshServicesProvider } from './contexts/RefreshServicesContext';

const theme = createTheme({
  primaryColor: 'relay-orange',
  colors: {
    'relay-orange': [
      '#fdf4ec',
      '#f5e4d6',
      '#e8c9ab',
      '#dcae80',
      '#d09558',
      '#c7833f',
      '#b87333',
      '#9d6230',
      '#825228',
      '#664220',
    ],
    paper: [
      '#fdfbf7',
      '#f8f4ef',
      '#f5f0e8',
      '#f0ebe1',
      '#e8e3d9',
      '#ded9cf',
      '#d4cfc5',
      '#c8c3b7',
      '#bcb7a9',
      '#b0ab9d',
    ],
    ink: [
      '#f7f6f5',
      '#e8e5e2',
      '#d4d0cb',
      '#b8b3ab',
      '#9c9690',
      '#8a8178',
      '#6b6258',
      '#5a524a',
      '#4a423a',
      '#3d3630',
    ],
    success: [
      '#f4faf4',
      '#e8f5e8',
      '#d1ecd1',
      '#b8e3b8',
      '#9fda9f',
      '#85d185',
      '#6dc86d',
      '#5a7d5a',
      '#4a6d4a',
      '#3a5d3a',
    ],
    error: [
      '#faf2f2',
      '#f5e5e5',
      '#edcdcd',
      '#e5b5b5',
      '#dd9d9d',
      '#d58585',
      '#c76d6d',
      '#a65d5d',
      '#864d4d',
      '#663d3d',
    ],
    warning: [
      '#fcfaf0',
      '#f9f5e0',
      '#f4efc0',
      '#efe9a0',
      '#e9e380',
      '#e3dd60',
      '#ddd740',
      '#c9a227',
      '#a9891f',
      '#897017',
    ],
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <AuthProvider>
        <DokployProvider>
          <RefreshServicesProvider>
            <Notifications position="top-right" />
            <Toaster position="top-right" richColors />
            <App />
          </RefreshServicesProvider>
        </DokployProvider>
      </AuthProvider>
    </MantineProvider>
  </React.StrictMode>
);

