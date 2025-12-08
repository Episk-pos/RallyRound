import { test as base, expect, Page, BrowserContext, APIRequestContext } from '@playwright/test';

/**
 * Custom test fixtures for RallyRound E2E tests
 *
 * Uses TEST_MODE backend bypass for authenticated tests.
 * The /auth/test-login endpoint creates a session without OAuth.
 */

// Frontend test server URL (requests go through vite proxy to backend)
const FRONTEND_URL = 'http://localhost:9000';
// Direct backend URL for API tests that bypass the proxy
const BACKEND_URL = 'http://localhost:9765';

/**
 * Test helper API for server-side GunDB manipulation
 * Bypasses client-side SEA auth for reliable multi-user testing
 */
export class TestHelpers {
  constructor(private request: APIRequestContext) {}

  /**
   * Create a topic directly in GunDB via server
   */
  async createTopic(options: {
    userId: string;
    title: string;
    description?: string;
    presenter?: string;
    presenterEmail?: string;
    minParticipants?: number;
  }) {
    const response = await this.request.post(`${FRONTEND_URL}/test/topic`, {
      data: options,
    });
    if (!response.ok()) {
      throw new Error(`Failed to create test topic: ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Express interest in a topic via server
   */
  async expressInterest(options: {
    topicId: string;
    userId: string;
    userName?: string;
    userEmail?: string;
  }) {
    const response = await this.request.post(`${FRONTEND_URL}/test/interest`, {
      data: options,
    });
    if (!response.ok()) {
      throw new Error(`Failed to express interest: ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Remove interest from a topic via server
   */
  async removeInterest(options: { topicId: string; userId: string }) {
    const response = await this.request.delete(`${FRONTEND_URL}/test/interest`, {
      data: options,
    });
    if (!response.ok()) {
      throw new Error(`Failed to remove interest: ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Update a topic's stage directly
   */
  async setTopicStage(options: { topicId: string; stage: number; presenterPub?: string }) {
    const response = await this.request.post(`${FRONTEND_URL}/test/topic/stage`, {
      data: options,
    });
    if (!response.ok()) {
      throw new Error(`Failed to set topic stage: ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Get current topic data from server
   */
  async getTopic(topicId: string) {
    const response = await this.request.get(`${FRONTEND_URL}/test/topic/${topicId}`);
    if (!response.ok()) {
      return null;
    }
    return response.json();
  }

  /**
   * Get all interests for a topic
   */
  async getInterests(topicId: string) {
    const response = await this.request.get(`${FRONTEND_URL}/test/interests/${topicId}`);
    if (!response.ok()) {
      throw new Error(`Failed to get interests: ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Clean up all test data
   */
  async cleanup() {
    const response = await this.request.delete(`${FRONTEND_URL}/test/cleanup`);
    if (!response.ok()) {
      console.warn('Test cleanup warning:', await response.text());
    }
  }
}

export const test = base.extend<{
  authenticatedPage: Page;
  secondUserContext: { page: Page; context: any };
  testHelpers: TestHelpers;
}>({
  // Test helpers for server-side GunDB manipulation
  testHelpers: async ({ request }, use) => {
    const helpers = new TestHelpers(request);
    await use(helpers);
  },

  // Fixture for authenticated page using TEST_MODE bypass
  authenticatedPage: async ({ page, context }, use) => {
    // Login via test endpoint through vite proxy (cookies work correctly on same origin)
    const response = await context.request.post(`${FRONTEND_URL}/auth/test-login`, {
      data: TEST_USER,
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(
        `Test login failed (${response.status()}): ${text}. ` +
        'Make sure the server is running with TEST_MODE=true'
      );
    }

    // Navigate and wait for SEA auth to complete
    await page.goto('/');
    await waitForAuthentication(page);

    await use(page);
  },

  // Second user for multi-user tests (e.g., interest threshold)
  secondUserContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login as second user
    const response = await context.request.post(`${FRONTEND_URL}/auth/test-login`, {
      data: TEST_USER_2,
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(
        `Second user login failed (${response.status()}): ${text}. ` +
        'Make sure the server is running with TEST_MODE=true'
      );
    }

    await page.goto('/');
    await waitForAuthentication(page);

    await use({ page, context });

    await context.close();
  },
});

export { expect };

/**
 * Helper to wait for the app to be ready (unauthenticated)
 */
export async function waitForAppReady(page: Page) {
  // Wait for the header to appear (indicates React has mounted)
  await page.waitForSelector('.header', { timeout: 10000 });
}

/**
 * Helper to wait for full authentication (Google session + SEA)
 */
export async function waitForAuthentication(page: Page) {
  // Wait for user name to appear (indicates both Google and SEA auth complete)
  await page.waitForFunction(
    () => {
      const userNameEl = document.querySelector('.user-name');
      return userNameEl && userNameEl.textContent?.trim();
    },
    { timeout: 15000 }
  );
}

/**
 * Test user data for TEST_MODE authentication
 */
export const TEST_USER = {
  userId: 'test-user-e2e-001',
  email: 'e2e-test@example.com',
  name: 'E2E Test User',
};

export const TEST_USER_2 = {
  userId: 'test-user-e2e-002',
  email: 'e2e-test2@example.com',
  name: 'E2E Test User 2',
};
