const express = require("express");
const axios = require("axios");
const Trade = require("../models/Trade");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzer = require("./oiAnalyzer");
const scheduler = require("./scheduler");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const puppeteer = require("puppeteer"); // ✅ Change to Puppeteer

const router = express.Router();

// Your existing routes
router.get("/", (req, res) => {
  res.json("working...");
});

router.get("/trades", async (req, res) => {
  const trades = await Trade.find().sort({ createdAt: -1 });
  res.json(trades);
});

router.get("/trades/open", async (req, res) => {
  const trades = await Trade.find({ status: "OPEN" });
  res.json(trades);
});

const nseIndia = new NseIndia();

router.post("/data", async (req, res) => {
  try {
    const { expiryDate, strikePrice, optionType, symbol } = req.body;
    const allData = await nseIndia.getIndexOptionChain(symbol);

    const matched = allData.records.data.find(d =>
      d.expiryDates.toString() === expiryDate &&
      d.strikePrice.toString() === strikePrice
    );

    if (!matched) {
      return res.status(404).json({ error: "Option not found" });
    }

    const price =
      optionType === "CE"
        ? matched.CE?.lastPrice
        : matched.PE?.lastPrice;

    return res.json({ price });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/oi-data", async (req, res) => {
  scheduler.start();
  const data = await oiAnalyzer.analyzeAndSelectOptions();
  return res.json(data);
});

const jar = new tough.CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    timeout: 15000
  })
);

// ✅ FIXED PUPPETEER LAUNCH
async function fetchTopStocksPuppeteer() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true, // Changed from "new" to true
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
        // ❌ REMOVED: "--single-process" (causes crashes)
        // ❌ REMOVED: "--disable-software-rasterizer"
        // ❌ REMOVED: "--disable-extensions"
      ],
      // Add timeout protection
      protocolTimeout: 60000
    });

    const page = await browser.newPage();

    // Set a reasonable timeout
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.goto("https://chartink.com/screener", {
      waitUntil: "domcontentloaded", // Changed from "networkidle2" (more reliable)
      timeout: 30000
    });

    // Wait a bit for the page to be ready
    await page.waitForSelector('meta[name="csrf-token"]', { timeout: 10000 });

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

    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error(
        "Chartink blocked or response changed: " +
        JSON.stringify(result).slice(0, 300)
      );
    }

    const sortedData = result.data.sort((a, b) => b.per_chg - a.per_chg).slice(0, 5);

    return sortedData;

  } catch (error) {
    console.error("Puppeteer error details:", error.message);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError.message);
      }
    }
  }
}

router.get("/top-stocks", async (req, res) => {
  try {
    const stocks = await fetchTopStocksPuppeteer();
    res.json({
      success: true,
      count: stocks.length,
      stocks
    });
  } catch (err) {
    console.error("Top stocks error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;