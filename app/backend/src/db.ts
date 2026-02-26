import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = '/app/.relaykit';
const BOOTSTRAP_KEY_FILE = path.join(DATA_DIR, 'bootstrap-key');
const OWNER_NPUB_FILE = path.join(DATA_DIR, 'owner-npub');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory exists
  }
}

export async function getBootstrapKey(): Promise<string | null> {
  try {
    const key = await fs.readFile(BOOTSTRAP_KEY_FILE, 'utf-8');
    return key.trim();
  } catch (error) {
    return null;
  }
}

export async function setBootstrapKey(key: string) {
  await ensureDataDir();
  await fs.writeFile(BOOTSTRAP_KEY_FILE, key, 'utf-8');
}

export async function getOwnerNpub(): Promise<string | null> {
  try {
    const npub = await fs.readFile(OWNER_NPUB_FILE, 'utf-8');
    return npub.trim();
  } catch (error) {
    return null;
  }
}

export async function setOwnerNpub(npub: string) {
  await ensureDataDir();
  await fs.writeFile(OWNER_NPUB_FILE, npub, 'utf-8');
}
