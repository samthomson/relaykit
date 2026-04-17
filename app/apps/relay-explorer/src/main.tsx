import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { buildRelaykitTheme } from '@relaykit/ui';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// FIXME: a custom font should be used. Eg:
// import '@fontsource-variable/<font-name>';

const theme = buildRelaykitTheme({ primaryColor: 'relayExplorer' });

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <MantineProvider theme={theme}>
      <Notifications />
      <App />
    </MantineProvider>
  </ErrorBoundary>
);
