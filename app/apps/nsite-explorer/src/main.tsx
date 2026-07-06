import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { buildRelaykitTheme } from '@relaykit/ui';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

const theme = buildRelaykitTheme({ primaryColor: 'nsiteExplorer' });

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <App />
    </MantineProvider>
  </ErrorBoundary>
);
