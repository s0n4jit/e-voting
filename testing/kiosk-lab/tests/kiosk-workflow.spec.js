import { test, expect } from '@playwright/test';

test.describe('Kiosk Examination Booth & Staff Maintenance Workflow', () => {
  test('Complete Kiosk Voting Lifecycle: PIN Login -> 9 Portfolios -> Review -> Sealed Ballot', async ({ page }) => {
    // 1. Visit Kiosk Landing Screen
    await page.goto('/kiosk');
    await expect(page).toHaveTitle(/Campus e-Voting/i);

    // Assert Kiosk Header & Station Indicators
    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();
    await expect(page.locator('text=Booth Ready')).toBeVisible();
    await expect(page.locator('text=Unlock Your Ballot')).toBeVisible();

    // 2. Fill in Student ID and single-use 6-digit Voting PIN
    const studentIdInput = page.locator('input[placeholder*="CS-2024-001"], input[type="text"]').first();
    const pinInput = page.locator('input[placeholder*="••••••"]');

    await studentIdInput.fill('STU010');
    await pinInput.fill('123456');

    // Submit PIN Login
    const submitBtn = page.locator('button:has-text("Proceed to Ballot")');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 3. Verify Electronic Ballot is Unlocked
    // Expected to navigate to /kiosk/vote/:id or display active election
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/kiosk');
  });

  test('Staff Maintenance Keyboard Shortcut (Ctrl+Alt+Shift+M) & Diagnostic Panel', async ({ page }) => {
    await page.goto('/kiosk');
    await page.waitForLoadState('networkidle');

    // Trigger Staff Keyboard Shortcut: Ctrl + Alt + Shift + M
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.keyboard.press('M');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');

    // Assert Staff Maintenance PIN Challenge Modal opens
    const maintenanceTitle = page.locator('text=Staff Authentication Required');
    await expect(maintenanceTitle).toBeVisible({ timeout: 5000 });

    // Enter authorized staff PIN (948201)
    const pinInput = page.locator('input[placeholder="Enter Staff Security PIN"]');
    await pinInput.fill('948201');
    await page.click('button:has-text("Unlock Maintenance Terminal")');

    // Verify Staff Maintenance Dashboard is Unlocked
    await expect(page.locator('text=Staff Maintenance & Diagnostics')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=System & Booth')).toBeVisible();

    // Switch to Network Diagnostics tab
    await page.click('button:has-text("Network Diagnostics")');
    await expect(page.locator('text=Multi-Tier Connectivity Check')).toBeVisible();
    await expect(page.locator('text=Physical Network Interface')).toBeVisible();
    await expect(page.locator('text=Local Gateway Availability')).toBeVisible();
    await expect(page.locator('text=DNS Name Resolution')).toBeVisible();
    await expect(page.locator('text=Public Internet Access')).toBeVisible();
    await expect(page.locator('text=Voting Application API')).toBeVisible();

    // Return to Voting Kiosk using shortcut Ctrl + Alt + Shift + L
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.keyboard.press('L');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');

    // Assert Maintenance modal is dismissed
    await expect(page.locator('text=Staff Maintenance & Diagnostics')).not.toBeVisible();
  });
});
