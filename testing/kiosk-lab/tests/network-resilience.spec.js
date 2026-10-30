import { test, expect } from '@playwright/test';

test.describe('Kiosk Network Resilience & Disconnection Handling', () => {
  test('Network offline event triggers full-screen protective overlay and auto-reconnects', async ({ page }) => {
    await page.goto('/kiosk');
    await page.waitForLoadState('networkidle');

    // Simulate Network Disconnection (Network Drop)
    await page.context().setOffline(true);

    // Verify Offline Overlay Appears with Reassurance Banner
    const offlineTitle = page.locator('text=Terminal Temporarily Offline');
    await expect(offlineTitle).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Ballot Integrity Protected')).toBeVisible();

    // Restore Network Link
    await page.context().setOffline(false);

    // Trigger online event in window
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Verify Overlay is Cleared and Kiosk Returns to Normal Operation
    await expect(offlineTitle).not.toBeVisible({ timeout: 6000 });
    await expect(page.locator('text=Unlock Your Ballot')).toBeVisible();
  });
});
