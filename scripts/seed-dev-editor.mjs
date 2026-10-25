#!/usr/bin/env node
/**
 * Local-development seed: creates or promotes an editor account that the dev
 * login provider can use. Never run this against production data.
 *
 * Usage:
 *   npm run seed:dev
 *   SEED_EDITOR_EMAIL=someone@example.com npm run seed:dev
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

// `npm run` does not load .env; do it here if the runtime supports it.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] Refusing to run with NODE_ENV=production.');
  process.exit(1);
}

const uri = process.env.DATABASE_URI || 'mongodb://localhost:27017/intranet';
const email = (process.env.SEED_EDITOR_EMAIL || 'editor@example.com').trim().toLowerCase();
const name = email;
const identitySubject = `dev:${email}`;
const now = new Date();

if (!email.includes('@')) {
  console.error(`[seed] Invalid email: ${email}`);
  process.exit(1);
}

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const domain = email.split('@')[1];

if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
  console.warn(`[seed] Warning: ${domain} is not in ALLOWED_EMAIL_DOMAINS (${allowedDomains.join(', ')}). Dev login will reject it.`);
}
if (process.env.ALLOW_DEV_LOGIN !== 'true') {
  console.warn('[seed] Warning: ALLOW_DEV_LOGIN is not "true", so this dev-login account cannot sign in.');
}

function databaseName(mongoUri) {
  try {
    return new URL(mongoUri).pathname.replace(/^\//, '') || 'intranet';
  } catch {
    return 'intranet';
  }
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(databaseName(uri));
  const users = db.collection('users');

  await users.updateOne(
    { email },
    {
      $set: {
        identitySubject,
        email,
        name,
        avatar: '',
        role: 'editor',
        active: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, __v: 0 },
    },
    { upsert: true },
  );

  const user = await users.findOne({ email }, { projection: { email: 1, role: 1, active: 1 } });
  console.log(`[seed] Editor ready: ${user.email} (role=${user.role}, active=${user.active})`);
  console.log(`[seed] Sign in at / with the dev login using ${email} (no password).`);
} catch (error) {
  console.error('[seed] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
