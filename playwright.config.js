// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const htmlFile = 'file:///' + path.resolve(__dirname, 'app/src/main/assets/index.html').replace(/\\/g, '/');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = defineConfig({
    testDir: './tests',
    timeout: 15000,
    retries: 0,
    reporter: 'list',
    use: {
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        htmlFile,
    },
    projects: [
        // ---- Small phones ----
        { name: 'iPhone SE',         use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
        // ---- Mid-size phones ----
        { name: 'Pixel 5',           use: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true } },
        { name: 'Galaxy S9+',        use: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true } },
        // ---- Large phones ----
        { name: 'iPhone 14 Pro Max',  use: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
        { name: 'Pixel 7',           use: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
        // ---- Narrow budget phone ----
        { name: 'Narrow 320px',      use: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    ],
});
