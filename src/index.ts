import express, { Request, Response } from 'express';
import cors from 'cors';
import * as puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'wind-speed-service' });
});

// Wind speed extraction endpoint
app.post('/api/wind-speed', async (req: Request, res: Response) => {
    const { address } = req.body;

    if (!address) {
        return res.status(400).json({
            success: false,
            error: 'Address is required',
        });
    }

    console.log(`[INFO] Starting wind speed lookup for: ${address}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1280,800',
        ],
    });

    let page;
    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Screenshot storage
        const screenshots: { name: string; data: string }[] = [];

        console.log('[DEBUG] Navigating to ASCE Hazard Tool...');
        await page.goto('https://ascehazardtool.org/', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        // Screenshot 1: After initial load
        screenshots.push({
            name: '1_after_load',
            data: (await page.screenshot({ encoding: 'base64' })) as string
        });
        console.log('[DEBUG] Screenshot 1: After initial load');

        // Helper function for clicking by text
        const clickByText = async (tag: string, text: string) => {
            try {
                const element = await page.waitForSelector(
                    `::-p-xpath(//${tag}[contains(text(), "${text}")])`,
                    { timeout: 3000 },
                );
                if (element) {
                    await element.click();
                    return true;
                }
            } catch (e) { }
            return false;
        };

        // 1. Handle Popups
        console.log('[DEBUG] Handling popups...');
        try {
            await clickByText('button', 'Got it!');
        } catch (e) { }

        // Welcome Popup - Try Escape first, then selectors
        try {
            await page.keyboard.press('Escape');
            await new Promise((r) => setTimeout(r, 1000));

            const closeSelectors = [
                'calcite-action[icon="x"]',
                'button[title="Close"]',
                '.modal-close',
                'span.esri-icon-close',
                'div[role="button"][aria-label="Close"]',
                '.calcite-action',
                'button.close',
                'calcite-modal .close',
            ];

            await page.evaluate((selectors) => {
                for (const sel of selectors) {
                    const els = document.querySelectorAll(sel);
                    els.forEach((el) => {
                        (el as HTMLElement).click();
                    });
                }
            }, closeSelectors);

            await new Promise((r) => setTimeout(r, 1000));
        } catch (e) {
            console.warn('[WARN] Popup close sequence error:', e);
        }

        // Screenshot 2: After modal close attempt
        screenshots.push({
            name: '2_after_modal_close',
            data: (await page.screenshot({ encoding: 'base64' })) as string
        });
        console.log('[DEBUG] Screenshot 2: After modal close attempt');

        // 2. Input Address
        console.log(`[DEBUG] Searching for address: ${address}`);
        const inputSelector =
            'input[placeholder="Enter Location"], input[type="text"].esri-input';

        try {
            // Attempt standard wait
            try {
                await page.waitForSelector(inputSelector, {
                    visible: true,
                    timeout: 5000,
                });
            } catch (e) {
                console.log('[DEBUG] Input not visible/interactable, attempting forced injection.');
            }

            // Force inject value even if covered
            await page.evaluate(
                (selector, addr) => {
                    const el = document.querySelector(selector) as HTMLInputElement;
                    if (el) {
                        el.value = addr;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.focus();
                    }
                },
                inputSelector,
                address,
            );

            // Also try standard type if possible
            try {
                await page.type(inputSelector, ' ', { delay: 100 });
            } catch (e) { }
        } catch (e) {
            console.error('[ERROR] Error interacting with input:', e);
            throw new Error('Could not input address');
        }

        // Screenshot 3: After address input
        screenshots.push({
            name: '3_after_address_input',
            data: (await page.screenshot({ encoding: 'base64' })) as string
        });
        console.log('[DEBUG] Screenshot 3: After address input');

        // Wait for suggestions
        const suggestionSelector =
            '.esri-search__suggestions-list li, ul[role="listbox"] li';
        try {
            await page.waitForSelector(suggestionSelector, { timeout: 8000 });
            const suggestion = await page.$(suggestionSelector);
            if (suggestion) {
                await suggestion.click();
            } else {
                await page.keyboard.press('Enter');
            }
        } catch (e) {
            console.warn('[WARN] No suggestions, using Enter...');
            await page.keyboard.press('Enter');
        }

        // 3. Select Risk Category II
        console.log('[DEBUG] Setting Risk Category...');
        await new Promise((r) => setTimeout(r, 3000));
        try {
            const riskSelect = await page.$('select[aria-label*="Risk"], select');
            if (riskSelect) {
                await riskSelect.select('II');
            }
        } catch (e) {
            console.warn('[WARN] Could not auto-select Risk Category.');
        }

        // 4. Select Load Type: Wind
        console.log('[DEBUG] Selecting Wind Load...');
        try {
            const windClicked = await clickByText('label', 'Wind');
            if (!windClicked) {
                const windCheckbox = await page.$(
                    'input[value="Wind"], input[name="Wind"]',
                );
                if (windCheckbox) await windCheckbox.click();
            }
        } catch (e) { }

        // 5. View Results
        console.log('[DEBUG] Clicking View Results...');

        // Screenshot 4: Before View Results
        screenshots.push({
            name: '4_before_view_results',
            data: (await page.screenshot({ encoding: 'base64' })) as string
        });
        console.log('[DEBUG] Screenshot 4: Before View Results');

        await clickByText('button', 'View Results');
        await new Promise((r) => setTimeout(r, 2000));

        // Screenshot 5: After View Results click
        screenshots.push({
            name: '5_after_view_results',
            data: (await page.screenshot({ encoding: 'base64' })) as string
        });
        console.log('[DEBUG] Screenshot 5: After View Results click');

        // 6. Extract Result
        console.log('[DEBUG] Waiting for results...');

        // Increased timeout to 60s for slow connections
        await page.waitForFunction(
            () => document.body.innerText.includes('Vmph'),
            { timeout: 60000 },
        );
        await new Promise((r) => setTimeout(r, 3000));

        const windSpeed = await page.evaluate(() => {
            // Heuristic: find text containing "Vmph"
            const elements = document.querySelectorAll('*');
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (
                    el.childNodes.length === 1 &&
                    el.textContent &&
                    el.textContent.includes('Vmph')
                ) {
                    return el.textContent.trim();
                }
            }
            // Fallback: TreeWalker
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
            );
            let node;
            while ((node = walker.nextNode())) {
                if (node.textContent && node.textContent.includes('Vmph')) {
                    return node.textContent.trim();
                }
            }
            return null;
        });

        if (windSpeed) {
            console.log(`[SUCCESS] Found Wind Speed: ${windSpeed}`);
            return res.json({
                address,
                windSpeed: parseFloat(windSpeed.match(/\d+/)?.[0] || '0'),
                vmph: parseFloat(windSpeed.match(/\d+/)?.[0] || '0'),
                source: 'ASCE Hazard Tool',
                retrievedAt: new Date(),
                success: true,
                rawValue: windSpeed,
                screenshots: screenshots
            });
        } else {
            throw new Error('Vmph not found on page.');
        }
    } catch (error: any) {
        console.error('[ERROR] Scraping failed:', error.message);

        // Capture error screenshot if page exists
        let errorScreenshots: { name: string; data: string }[] = [];
        try {
            if (page) {
                errorScreenshots.push({
                    name: 'error_state',
                    data: (await page.screenshot({ encoding: 'base64' })) as string
                });
            }
        } catch (e) { }

        return res.status(500).json({
            address,
            source: 'ASCE Hazard Tool',
            retrievedAt: new Date(),
            success: false,
            error: error.message,
            screenshots: errorScreenshots
        });
    } finally {
        await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Wind Speed Service running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API endpoint: POST http://localhost:${PORT}/api/wind-speed`);
});
