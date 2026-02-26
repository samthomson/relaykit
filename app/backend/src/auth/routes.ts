import { Router } from 'express';
import { generateChallenge, verifyChallengeResponse, NostrEvent } from './nostr';
import { signJWT, verifyJWT } from './jwt';
import { getBootstrapKey, getOwnerNpub } from '../db';

const router = Router();

// Store active challenges (in-memory for now, could move to Redis)
const challenges = new Map<string, { challenge: string; timestamp: number }>();

// Cleanup old challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [npub, data] of challenges.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) {
      challenges.delete(npub);
    }
  }
}, 5 * 60 * 1000);

// Step 1: Get challenge to sign
router.post('/auth/challenge', (req, res) => {
  const { npub } = req.body;
  
  if (!npub || typeof npub !== 'string') {
    return res.status(400).json({ error: 'npub required' });
  }

  const challenge = generateChallenge();
  challenges.set(npub, { challenge, timestamp: Date.now() });

  res.json({ challenge });
});

// Step 2: Verify signed challenge and login
router.post('/auth/login', async (req, res) => {
  try {
    const { event } = req.body as { event: NostrEvent };

    console.log('Login attempt with event:', JSON.stringify(event, null, 2));

    if (!event || !event.pubkey || !event.sig) {
      return res.status(400).json({ error: 'Invalid event' });
    }

    const npub = event.pubkey;
    const challengeData = challenges.get(npub);

    console.log('Challenge data:', challengeData);

    if (!challengeData) {
      return res.status(400).json({ error: 'No challenge found. Request a challenge first.' });
    }

    // Verify the signed challenge
    const isValid = verifyChallengeResponse(challengeData.challenge, event);
    console.log('Challenge verification result:', isValid);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature or expired challenge' });
    }

    // Clear used challenge
    challenges.delete(npub);

    // Check if this npub is the owner
    const ownerNpub = await getOwnerNpub();
    if (!ownerNpub) {
      return res.status(503).json({
        code: 'RELAYKIT_NOT_CONFIGURED',
        error: 'This RelayKit instance is not set up yet. The owner must run the install script with OWNER_NPUB=your_npub, or set owner-npub manually.',
      });
    }

    if (npub !== ownerNpub) {
      return res.status(403).json({ error: 'Only the owner can access this RelayKit instance.' });
    }

    // Verify bootstrap key exists
    const bootstrapKey = await getBootstrapKey();
    if (!bootstrapKey) {
      return res.status(503).json({
        code: 'RELAYKIT_NOT_CONFIGURED',
        error: 'This RelayKit instance is not set up yet. The owner must run the install/setup script to configure the Dokploy API key.',
      });
    }

    // Generate RelayKit JWT
    const token = signJWT(npub);
    res.json({ token, npub });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify JWT token (for frontend to check auth status)
router.get('/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = verifyJWT(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const bootstrapKey = await getBootstrapKey();
  res.json({ 
    npub: payload.npub,
    dokployApiKey: bootstrapKey
  });
});

export default router;
