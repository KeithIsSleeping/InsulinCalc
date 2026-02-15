/**
 * Google Play Store Screenshot Generator
 * 
 * Generates screenshots at 1080x1920 (phone) resolution
 * showing key app states for the Play Store listing.
 * 
 * Run: npx playwright test tests/screenshots.spec.js --project="Pixel 5"
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const htmlFile = 'file:///' + path.resolve(__dirname, '../app/src/main/assets/index.html').replace(/\\/g, '/');
const outDir = path.resolve(__dirname, '../store-assets/screenshots');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

// Use a phone-like viewport that produces 1080x1920 screenshots
test.use({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
});

async function setupApp(page) {
    await page.goto(htmlFile);
    await page.waitForTimeout(300);
    // Accept terms if shown
    const termsBtn = page.locator('.terms-accept');
    if (await termsBtn.isVisible()) {
        await termsBtn.click();
        await page.waitForTimeout(300);
    }
}

test.describe('Play Store Screenshots', () => {

    test('01 - Main calculator (dark)', async ({ page }) => {
        await setupApp(page);

        // Fill in sample values for a realistic screenshot
        await page.fill('#carbsToEat', '45');
        await page.fill('#currentGlucose', '185');

        // Set some profile values via localStorage  
        await page.evaluate(() => {
            // Unlock and set carb ratio
            const cr = document.getElementById('carbRatio');
            cr.readOnly = false;
            cr.value = '10';
            cr.dispatchEvent(new Event('input'));

            const cf = document.getElementById('correctionFactor');
            cf.readOnly = false;
            cf.value = '40';
            cf.dispatchEvent(new Event('input'));

            const tgt = document.getElementById('target');
            tgt.readOnly = false;
            tgt.value = '120';
            tgt.dispatchEvent(new Event('input'));
        });

        // Calculate
        await page.click('.calc-btn');
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(outDir, '01-calculator-dark.png'), fullPage: false });
    });

    test('02 - Main calculator (light)', async ({ page }) => {
        await page.goto(htmlFile);
        await page.waitForTimeout(300);

        const termsBtn = page.locator('.terms-accept');
        if (await termsBtn.isVisible()) {
            await termsBtn.click();
            await page.waitForTimeout(300);
        }

        // Switch to light theme via DOM
        await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        });
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForTimeout(200);

        await page.fill('#carbsToEat', '30');
        await page.fill('#currentGlucose', '210');

        await page.evaluate(() => {
            const cr = document.getElementById('carbRatio');
            cr.readOnly = false;
            cr.value = '12';
            cr.dispatchEvent(new Event('input'));

            const cf = document.getElementById('correctionFactor');
            cf.readOnly = false;
            cf.value = '50';
            cf.dispatchEvent(new Event('input'));

            const tgt = document.getElementById('target');
            tgt.readOnly = false;
            tgt.value = '110';
            tgt.dispatchEvent(new Event('input'));
        });

        await page.click('.calc-btn');
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(outDir, '02-calculator-light.png'), fullPage: false });
    });

    test('03 - CGM trend panel open', async ({ page }) => {
        await setupApp(page);

        await page.fill('#carbsToEat', '45');
        await page.fill('#currentGlucose', '185');

        // Open trend panel
        await page.click('#trendToggle');
        await page.waitForTimeout(400);

        await page.screenshot({ path: path.join(outDir, '03-cgm-trends.png'), fullPage: false });
    });

    test('04 - Settings page', async ({ page }) => {
        await setupApp(page);

        // Open settings
        await page.click('.settings-btn');
        await page.waitForTimeout(400);

        await page.screenshot({ path: path.join(outDir, '04-settings.png'), fullPage: false });
    });

    test('05 - Profile editor', async ({ page }) => {
        await setupApp(page);

        // Open settings  
        await page.click('.settings-btn');
        await page.waitForTimeout(400);

        // Click add profile
        await page.click('.profile-add-full');
        await page.waitForTimeout(400);

        // Fill in profile
        await page.fill('#profileEditorName', 'Breakfast');
        await page.fill('#profileEditorStart', '06:00');
        await page.fill('#profileEditorEnd', '11:00');
        await page.fill('#profileEditorCarbRatio', '8');
        await page.fill('#profileEditorCF', '35');
        await page.fill('#profileEditorTarget', '120');

        await page.screenshot({ path: path.join(outDir, '05-profile-editor.png'), fullPage: false });
    });

    test('06 - Multiple profiles with results', async ({ page }) => {
        await setupApp(page);

        // Create profiles via JS
        await page.evaluate(() => {
            const profiles = [
                { id: '1', name: 'Breakfast', startTime: '06:00', endTime: '11:00', carbRatio: '8', correctionFactor: '35', target: '120' },
                { id: '2', name: 'Lunch', startTime: '11:00', endTime: '17:00', carbRatio: '12', correctionFactor: '45', target: '110' },
                { id: '3', name: 'Dinner', startTime: '17:00', endTime: '22:00', carbRatio: '10', correctionFactor: '40', target: '120' },
            ];
            localStorage.setItem('profiles', JSON.stringify(profiles));
            localStorage.setItem('activeProfile', '1');
            location.reload();
        });
        await page.waitForTimeout(600);

        const termsBtn = page.locator('.terms-accept');
        if (await termsBtn.isVisible()) {
            await termsBtn.click();
            await page.waitForTimeout(300);
        }

        await page.fill('#carbsToEat', '55');
        await page.fill('#currentGlucose', '195');
        await page.click('.calc-btn');
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(outDir, '06-profiles-results.png'), fullPage: false });
    });
});
