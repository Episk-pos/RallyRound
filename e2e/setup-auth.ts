/**
 * Authentication State Setup Script
 *
 * This script helps set up persistent authentication state for real OAuth testing.
 * Run manually with: pnpm test:setup-auth
 *
 * After completing Google sign-in, the browser state is saved to e2e/.auth/user.json
 * This state can be reused in tests via the 'chromium-real-auth' project.
 */

import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');

test('setup authenticated state', async ({ page, context }) => {
  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // Navigate to the app
  await page.goto('/');

  // Click sign in button
  console.log('\n========================================');
  console.log('MANUAL AUTHENTICATION REQUIRED');
  console.log('========================================');
  console.log('1. A browser window will open');
  console.log('2. Click "Sign in with Google"');
  console.log('3. Complete the Google OAuth flow');
  console.log('4. Wait for redirect back to the app');
  console.log('5. The script will automatically save auth state');
  console.log('========================================\n');

  // Click the sign in button
  await page.click('text=Sign in with Google');

  // Wait for OAuth completion - user will be redirected back with auth=success
  // Give user up to 2 minutes to complete OAuth
  await page.waitForURL('**/?auth=success', { timeout: 120000 });

  console.log('OAuth redirect detected, waiting for full authentication...');

  // Wait for full authentication (user name appears in header)
  await page.waitForSelector('.user-name', { timeout: 30000 });

  const userName = await page.locator('.user-name').textContent();
  console.log(`Authenticated as: ${userName}`);

  // Save the storage state
  await context.storageState({ path: AUTH_FILE });

  console.log('\n========================================');
  console.log('SUCCESS!');
  console.log(`Auth state saved to: ${AUTH_FILE}`);
  console.log('You can now run: pnpm test:real-auth');
  console.log('========================================\n');
});
