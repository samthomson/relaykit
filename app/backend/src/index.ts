import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc';
import authRoutes from './auth/routes';
import { createAuthContext } from './auth/middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Auth routes
app.use(authRoutes);

// tRPC endpoint
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: createAuthContext,
  })
);

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // Health check for dev mode
  app.get('/', (req, res) => {
    res.send('<h1>RelayKit</h1><p>Backend running</p>');
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`RelayKit backend running on port ${PORT}`);
});

