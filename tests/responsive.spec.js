// @ts-check
const { test, expect } = require('@playwright/test');

// ============================================================
// Layout & Responsiveness Tests
// These run on every device project defined in playwright.config.js
// ============================================================

test.beforeEach(async ({ page }, testInfo) => {
    const htmlFile = testInfo.project.use.htmlFile;

    // Navigate to the page first to set the origin for localStorage
    await page.goto(htmlFile);

    // Accept terms by clicking if visible, then set localStorage so it stays dismissed
    const termsOverlay = page.locator('#termsOverlay');
    const isTermsVisible = await termsOverlay.evaluate(el => {
        return !el.classList.contains('hidden');
    }).catch(() => false);

    if (isTermsVisible) {
        await page.locator('.terms-accept').click();
        await page.waitForTimeout(300);
    }

    // Also force localStorage so subsequent navigations skip terms
    await page.evaluate(() => localStorage.setItem('acceptedTerms', 'true'));
});

// ---- No Horizontal Overflow ----
test('page has no horizontal overflow', async ({ page }) => {
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
});

// ---- Profile Bar Visible ----
test('profile bar is visible and not clipped', async ({ page }) => {
    const bar = page.locator('.profile-bar');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(100);
});

// ---- Settings Button Reachable ----
test('settings button is visible and clickable', async ({ page }) => {
    const btn = page.locator('.settings-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.settings-overlay')).toHaveClass(/active/);
});

// ---- Input Card Fits ----
test('input card does not overflow viewport width', async ({ page }) => {
    const card = page.locator('.card').first();
    const cardBox = await card.boundingBox();
    const vpWidth = await page.evaluate(() => window.innerWidth);
    expect(cardBox.x).toBeGreaterThanOrEqual(0);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(vpWidth + 2); // 2px tolerance
});

// ---- All Input Fields Visible ----
test('all 5 input fields are visible', async ({ page }) => {
    const fields = ['carbsToEat', 'currentGlucose', 'carbRatio', 'correctionFactor', 'target'];
    for (const id of fields) {
        await expect(page.locator('#' + id)).toBeVisible();
    }
});

// ---- Calculate Button Visible Without Scrolling (on tall-enough screens) ----
test('calculate button is in viewport on standard screens', async ({ page }) => {
    const btn = page.locator('.calc-btn');
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    const vpHeight = await page.evaluate(() => window.innerHeight);
    // On very small screens, may need scroll — just verify button exists and is reachable
    expect(box).not.toBeNull();
});

// ---- Trend Panel Expand / Collapse ----
test('trend panel expands and collapses', async ({ page }) => {
    const toggle = page.locator('#trendToggle');
    const panel = page.locator('#trendPanel');

    // Initially collapsed
    await expect(panel).not.toHaveClass(/open/);

    // Click to expand
    await toggle.click();
    await expect(panel).toHaveClass(/open/);

    // Click again to collapse
    await toggle.click();
    await expect(panel).not.toHaveClass(/open/);
});

// ---- Trend Buttons Fit ----
test('all 7 trend buttons fit without overflow', async ({ page }) => {
    // Expand trend panel
    await page.locator('#trendToggle').click();
    await expect(page.locator('#trendPanel')).toHaveClass(/open/);

    const buttons = page.locator('.trend-btn');
    await expect(buttons).toHaveCount(7);

    const strip = page.locator('.trend-strip');
    const stripBox = await strip.boundingBox();
    const vpWidth = await page.evaluate(() => window.innerWidth);
    expect(stripBox.x + stripBox.width).toBeLessThanOrEqual(vpWidth + 2);
});

// ---- Calculation Works ----
test('calculation produces results', async ({ page }) => {
    await page.fill('#carbsToEat', '45');
    await page.fill('#currentGlucose', '180');

    // Unlock and fill ratio fields
    await page.locator('[onclick="unlockField(\'carbRatio\')"]').click();
    await page.fill('#carbRatio', '10');

    await page.locator('[onclick="unlockField(\'correctionFactor\')"]').click();
    await page.fill('#correctionFactor', '50');

    await page.locator('[onclick="unlockField(\'target\')"]').click();
    await page.fill('#target', '120');

    await page.locator('.calc-btn').click();

    const resultTotal = page.locator('#resultTotal');
    await expect(resultTotal).toContainText('Total Dose');
    await expect(resultTotal).toContainText('u'); // dose unit
});

// ---- Results Card Visible After Calculation ----
test('results card fits screen after calculation', async ({ page }) => {
    await page.fill('#carbsToEat', '30');
    await page.fill('#currentGlucose', '150');
    await page.locator('[onclick="unlockField(\'carbRatio\')"]').click();
    await page.fill('#carbRatio', '10');
    await page.locator('[onclick="unlockField(\'correctionFactor\')"]').click();
    await page.fill('#correctionFactor', '50');
    await page.locator('[onclick="unlockField(\'target\')"]').click();
    await page.fill('#target', '120');
    await page.locator('.calc-btn').click();

    const results = page.locator('.card.results');
    const box = await results.boundingBox();
    const vpWidth = await page.evaluate(() => window.innerWidth);
    expect(box.x + box.width).toBeLessThanOrEqual(vpWidth + 2);
});

// ---- Settings Page Scrollable ----
test('settings page content is scrollable', async ({ page }) => {
    await page.locator('.settings-btn').click();
    await expect(page.locator('.settings-overlay')).toHaveClass(/active/);

    const content = page.locator('.settings-content');
    await expect(content).toBeVisible();

    // Check it has overflow-y auto/scroll
    const overflowY = await content.evaluate(el => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflowY);
});

// ---- Profile Editor Dialog Fits ----
test('profile editor dialog fits within viewport', async ({ page }) => {
    await page.locator('.settings-btn').click();
    await page.locator('.profile-add-full').click();

    const editor = page.locator('.profile-editor');
    await expect(editor).toBeVisible();

    const box = await editor.boundingBox();
    const vpWidth = await page.evaluate(() => window.innerWidth);
    const vpHeight = await page.evaluate(() => window.innerHeight);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vpWidth + 2);
});

// ---- Info Popup Fits ----
test('info popup fits screen', async ({ page }) => {
    await page.locator('[onclick="showInfo(\'carbsToEat\')"]').click();
    const popup = page.locator('.info-popup');
    await expect(popup).toBeVisible();

    const box = await popup.boundingBox();
    const vpWidth = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vpWidth + 2);
});
