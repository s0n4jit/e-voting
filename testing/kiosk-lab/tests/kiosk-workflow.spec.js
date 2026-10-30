// @ts-check
const { test, expect } = require('@playwright/test');
const { DeskApiHelper } = require('./helpers/desk-api');

test.describe('Campus E-Voting System — Complete Kiosk Workflow', () => {
  let deskHelper;

  test.beforeAll(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    deskHelper = new DeskApiHelper(baseUrl);
  });

  test('E2E Full Ballot Cast across 9 Portfolios + NOTA & Staff Maintenance Panel', async ({ page, baseURL }) => {
    test.setTimeout(90000);

    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('response', async resp => {
      if (resp.url().includes('/api/')) {
        console.log(`[NETWORK RESP] ${resp.status()} ${resp.url()}`);
        if (resp.status() >= 400) {
          try {
            console.log(`[NETWORK ERR BODY] ${await resp.text()}`);
          } catch (e) {}
        }
      }
    });

    // ── 1. Desk Officer Issues Voting PIN Slip ───────────────────────────────
    console.log('Step 1: Polling Desk issues official single-use PIN slip...');
    const voter = await deskHelper.issueVotingPin();
    console.log(`Issued PIN for Student: ${voter.student_id}, PIN: ${voter.voting_pin}`);

    expect(voter.student_id).toBeTruthy();
    expect(voter.voting_pin).toHaveLength(6);

    // ── 2. Fullscreen Kiosk Landing ──────────────────────────────────────────
    console.log('Step 2: Voter arrives at kiosk terminal at /kiosk...');
    await page.goto('/kiosk');

    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();
    await expect(page.locator('text=Official Terminal')).toBeVisible();
    await expect(page.locator('text=Scan barcode on your Student ID')).toBeVisible();

    // ── 3. Authenticate with Student ID + PIN Slip ───────────────────────────
    console.log('Step 3: Entering Student ID and 6-digit PIN...');
    const studentIdInput = page.locator('input[placeholder*="CS-2024-001"], input[type="text"]').first();
    const pinInput = page.locator('input[placeholder*="••••••"], input[inputmode="numeric"]').first();

    await studentIdInput.fill(voter.student_id);
    await pinInput.fill(voter.voting_pin);

    const proceedBtn = page.locator('button:has-text("Proceed to Ballot")');
    await expect(proceedBtn).toBeEnabled();
    await proceedBtn.click();

    // ── 4. Enter Stepper Voting Wizard ───────────────────────────────────────
    console.log('Step 4: Waiting for ballot wizard navigation...');
    await page.waitForURL(/\/kiosk\/vote\/\d+/, { timeout: 15000 });
    await expect(page.locator('text=Student Union Election 2026–27')).toBeVisible();
    await expect(page.locator('text=Secret Ballot')).toBeVisible();

    // ── 5. Walkthrough All 9 Portfolios Stepper ──────────────────────────────
    console.log('Step 5: Navigating through all 9 executive portfolios...');

    const expectedPortfolios = [
      'Vice President',
      'General Secretary',
      'Assistant General Secretary',
      'Cultural Secretary',
      'Magazine Secretary',
      'Boys Common Room Secretary',
      'Girls Common Room Secretary',
      'Major Games Secretary',
      'Minor Games Secretary',
    ];

    for (let stepIndex = 0; stepIndex < 9; stepIndex++) {
      const stepNum = stepIndex + 1;
      console.log(`Voting on Portfolio ${stepNum} of 9: ${expectedPortfolios[stepIndex]}`);

      // Verify portfolio title card is visible
      await expect(page.locator(`text=Step ${stepNum} of 9`)).toBeVisible({ timeout: 8000 });

      // Alternate selection: on even steps choose candidate, on odd steps choose NOTA
      if (stepIndex % 2 === 1) {
        console.log(`  -> Choosing None of the Above (NOTA) for Step ${stepNum}`);
        const notaCard = page.locator('text=None of the Above (NOTA)').first();
        await expect(notaCard).toBeVisible();
        await notaCard.click();
      } else {
        console.log(`  -> Choosing Nominated Candidate for Step ${stepNum}`);
        // Click first available candidate card
        const candidateCard = page.locator('h4.text-base.font-bold').first();
        await expect(candidateCard).toBeVisible();
        await candidateCard.click();
      }

      // Assert Choice Selected badge
      await expect(page.locator('text=Choice Selected')).toBeVisible();

      // Click Next Portfolio or Final Review
      if (stepIndex < 8) {
        const nextBtn = page.locator('button:has-text("Next Portfolio")');
        await expect(nextBtn).toBeEnabled();
        await nextBtn.click();
      } else {
        const reviewBtn = page.locator('button:has-text("Go to Final Review")');
        await expect(reviewBtn).toBeEnabled();
        await reviewBtn.click();
      }
    }

    // ── 6. Step 10: Confirmation & Review Screen ─────────────────────────────
    console.log('Step 6: Verifying Step 10 Final Review screen...');
    await expect(page.locator('text=Review Your Executive Ballot')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Final Step • Complete Ballot Verification')).toBeVisible();

    // Verify all portfolios have decisions recorded
    await expect(page.locator('text=9 / 9')).toBeVisible();
    await expect(page.locator('text=Portfolios Decided')).toBeVisible();

    // ── 7. Submit Secret Ballot ──────────────────────────────────────────────
    console.log('Step 7: Confirming and casting secret ballot...');
    const castBallotBtn = page.locator('button:has-text("Confirm & Cast Secret Ballot")');
    await expect(castBallotBtn).toBeEnabled();
    await castBallotBtn.click();

    // ── 8. Success Confirmation & Automatic Reset ────────────────────────────
    console.log('Step 8: Verifying ballot receipt & session reset...');
    await expect(page.locator('text=Secret Ballot Sealed & Cast')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Your secret ballot has been cast and recorded!')).toBeVisible();

    // Verify booth exit button exists and resets session
    const exitBtn = page.locator('button:has-text("Exit Booth for Next Voter")');
    await expect(exitBtn).toBeVisible();
    await exitBtn.click();

    // Ensure session returns to pristine kiosk landing page
    await page.waitForURL(/\/kiosk$/, { timeout: 10000 });
    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();

    // ── 9. Staff Maintenance Mode Verification (Ctrl+Alt+Shift+M) ────────────
    console.log('Step 9: Testing Staff Maintenance shortcut (Ctrl + Alt + Shift + M)...');
    await page.keyboard.press('Control+Alt+Shift+KeyM');

    // Verify Maintenance authentication modal opens
    await expect(page.locator('text=Staff Authentication Required')).toBeVisible({ timeout: 5000 });

    // Enter staff PIN: 948201
    const staffPinInput = page.locator('input[placeholder="Enter Staff Security PIN"]');
    await staffPinInput.fill('948201');

    const unlockBtn = page.locator('button:has-text("Unlock Maintenance Terminal")');
    await unlockBtn.click();

    // Verify authenticated maintenance dashboard is displayed
    console.log('Verifying maintenance dashboard and diagnostics...');
    await expect(page.locator('text=Staff Maintenance & Diagnostics')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=System & Booth')).toBeVisible();
    await expect(page.getByText('Terminal Station', { exact: true })).toBeVisible();
    await expect(page.locator('text=BOOTH-LAB-01').first()).toBeVisible();

    // Switch to Network tab
    const netTab = page.locator('button:has-text("Network Diagnostics")');
    await netTab.click();
    await expect(page.locator('text=Physical Network Interface')).toBeVisible();

    // Close maintenance mode using Return to Voting Kiosk button
    const returnKioskBtn = page.locator('button:has-text("Return to Voting Kiosk")').first();
    await returnKioskBtn.click();

    await expect(page.locator('text=Staff Authentication Required')).not.toBeVisible();
    await expect(page.locator('text=Campus Polling Booth')).toBeVisible();
    console.log('E2E Kiosk Workflow Test Completed Successfully!');
  });
});
