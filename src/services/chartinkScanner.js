const puppeteer = require("puppeteer");

const { chromium } = require("playwright-chromium");

async function fetchTopStocksPlaywright() {
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });

    const page = await context.newPage();

    await page.goto("https://chartink.com/screener", {
        waitUntil: "networkidle",
        timeout: 60000
    });

    const scanClause = `( {cash} ( daily close > daily ema(daily close, 61) and 1 day ago close <= 1 day ago ema(daily close, 61) and daily rsi(12) > 60 and 1 day ago rsi(12) <= 60 ) )`;

    const result = await page.evaluate(async (scanClause) => {
        const tokenEl = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = tokenEl ? tokenEl.getAttribute("content") : null;

        if (!csrfToken) {
            return { error: "CSRF token not found in page" };
        }

        const res = await fetch("/screener/process", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "x-csrf-token": csrfToken
            },
            body: "scan_clause=" + encodeURIComponent(scanClause)
        });

        const text = await res.text();

        try {
            return JSON.parse(text);
        } catch {
            return { error: "Non JSON response", raw: text.slice(0, 500) };
        }
    }, scanClause);

    await browser.close();

    if (!result || !result.data || !Array.isArray(result.data)) {
        throw new Error(
            "Chartink blocked or response changed: " +
            JSON.stringify(result).slice(0, 300)
        );
    }

    return result.data.sort((a, b) => b.per_chg - a.per_chg).slice(0, 5);
}

module.exports = fetchTopStocksPlaywright;