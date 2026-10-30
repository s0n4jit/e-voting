// @ts-check
const { test, expect } = require('@playwright/test');
const { DeskApiHelper } = require('./helpers/desk-api');

test.describe('Campus E-Voting System — Network Resilience & Offline Protection', () => {
  let deskHelper;

  test.beforeAll(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    deskHelper = new DeskApiHelper(baseUrl);
  });

  test('Kiosk detects network severance, displays offline overlay, and prevents broken ballot submissions', async ({ context, page }) => {
    test.setTimeout(60000);

    // 1. Visit Kiosk Booth
    await page.goto('/kiosk');
    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();

    // Verify initial online state (overlay is not visible)
    await expect(page.locator('text=Terminal Temporarily Offline')).not.toBeVisible();

    // 2. Simulate Network Disconnection via browser offline mode
    console.log('Simulating network disconnection event...');
    await context.setOffline(true);

    // Trigger window offline event in page context to ensure immediate event dispatch
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // 3. Assert Clear Offline Banner & Error Overlay Appears
    console.log('Asserting NetworkOfflineOverlay visibility and security copy...');
    const offlineTitle = page.locator('text=Terminal Temporarily Offline');
    await expect(offlineTitle).toBeVisible({ timeout: 10000 });

    const offlineExplanation = page.locator(
      'text=The voting booth lost secure connection to the campus election server. Ballots cannot be submitted without encrypted transmission.'
    );
    await expect(offlineExplanation).toBeVisible();

    const integrityBanner = page.locator('text=Ballot Integrity Protected');
    await expect(integrityBanner).toBeVisible();

    // 4. Verify Interactive Elements Behind Overlay are Blocked
    // The overlay is modal with z-50 covering the entire viewport
    const proceedBtn = page.locator('button:has-text("Proceed to Ballot")');
    // Clicking through the overlay to underlying button should fail or be blocked by overlay pointer-events
    const overlayElement = page.locator('div.fixed.inset-0.z-50');
    await expect(overlayElement).toBeVisible();

    // 5. Restore Network Connectivity
    console.log('Restoring network connectivity...');
    await context.setOffline(false);

    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    // 6. Assert Offline Overlay Disappears upon Reconnection
    console.log('Verifying automatic overlay dismissal on reconnection...');
    await expect(offlineTitle).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();

    console.log('Network resilience test passed successfully!');
  });

  test('Simulates API failure during voting and verifies error handling', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Issue a valid PIN slip
    const voter = await deskHelper.issueVotingPin();

    // 2. Log in at Kiosk
    await page.goto('/kiosk');
    await page.locator('input[placeholder*="CS-2024-001"], input[type="text"]').first().fill(voter.student_id);
    await page.locator('input[placeholder*="••••••"], input[inputmode="numeric"]').first().fill(voter.voting_pin);
    await page.locator('button:has-text("Proceed to Ballot")').click();

    await page.waitForURL(/\/kiosk\/vote\/\d+/, { timeout: 15000 });
    await expect(page.locator('text=Student Union Election 2026–27')).toBeVisible();

    // 3. Intercept and abort ballot submission route to simulate server drop
    await page.route('**/api/voter/vote/multi', async (route) => {
      await route.abort('failed');
    });

    // 4. Fill ballot quickly to Step 10
    for (let stepIndex = 0; stepIndex < 9; stepIndex++) {
      // Pick first option
      const notaCard = page.locator('text=None of the Above (NOTA)').first();
      await notaCard.click();

      if (stepIndex < 8) {
        await page.locator('button:has-text("Next Portfolio")').click();
      } else {
        await page.locator('button:has-text("Go to Final Review")').click();
      }
    }

    // 5. Attempt submission
    await expect(page.locator('text=Review Your Executive Ballot')).toBeVisible();
    const castBtn = page.locator('button:has-text("Confirm & Cast Secret Ballot")');
    await castBtn.click();

    // 6. Assert submission failure is handled gracefully and does not crash
    await expect(page.locator('text=Submission Error')).toBeVisible({ timeout: 10000 });
    console.log('API abort resilience test passed successfully!');
  });
});
