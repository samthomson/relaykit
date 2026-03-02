import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc';
import authRoutes from './auth/routes';
import { createAuthContext } from './auth/middleware';

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

// Health check
app.get('/', (req, res) => {
  res.send('<h1>RelayKit</h1><p>Backend running</p>');
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`RelayKit backend running on port ${PORT}`);
});

