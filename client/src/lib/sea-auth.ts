import { genDeterministicSEAPair } from '@gooddollar/gun-pk-auth';
import { user } from './gun';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  authenticated: boolean;
}

export interface AuthState {
  googleUser: GoogleUser | null;
  seaPub: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Fetch current Google OAuth user from server session
 */
export async function fetchGoogleUser(): Promise<GoogleUser | null> {
  try {
    const response = await fetch('/auth/user', {
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Google user:', error);
    return null;
  }
}

/**
 * Fetch SEA seed from server and authenticate with GunDB
 */
export async function authenticateWithSEA(): Promise<string | null> {
  try {
    // Get deterministic seed from server
    const response = await fetch('/auth/sea-seed', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch SEA seed');
    }

    const { seed } = await response.json();

    // Generate deterministic SEA keypair from seed
    const seaPair = genDeterministicSEAPair(seed);

    // Authenticate with GunDB using the keypair
    return new Promise((resolve, reject) => {
      user.auth(seaPair as any, (ack: any) => {
        if (ack.err) {
          console.error('SEA auth failed:', ack.err);
          reject(new Error(ack.err));
        } else {
          console.log('SEA auth successful, pub:', user.is?.pub);
          resolve(user.is?.pub || null);
        }
      });
    });
  } catch (error) {
    console.error('Failed to authenticate with SEA:', error);
    return null;
  }
}

/**
 * Full authentication flow: Google OAuth -> SEA
 */
export async function fullAuth(): Promise<{ googleUser: GoogleUser; seaPub: string } | null> {
  // First check Google auth
  const googleUser = await fetchGoogleUser();
  if (!googleUser) {
    return null;
  }

  // Then authenticate with SEA
  const seaPub = await authenticateWithSEA();
  if (!seaPub) {
    return null;
  }

  return { googleUser, seaPub };
}

/**
 * Logout from both server session and SEA
 */
export async function logout(): Promise<void> {
  // Logout from server
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  // Leave GunDB user
  user.leave();
}

/**
 * Redirect to Google OAuth
 */
export function redirectToGoogleAuth(): void {
  window.location.href = '/auth/google';
}
