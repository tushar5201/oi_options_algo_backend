const express = require("express");
const axios = require("axios");
const Trade = require("../models/Trade");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzer = require("./oiAnalyzer");
const scheduler = require("./scheduler");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");

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

// router.get("/rise-in-oi-rise-in-price", async (req, res) => {

// });

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

const SCAN_CLAUSE = `( {cash} ( latest ema( close, 61 ) > latest ema( close, 60 ) and latest rsi( 3 ) > 60 ) )`;

const puppeteer = require("puppeteer");

async function fetchTopStocksPuppeteer() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );

  await page.goto("https://chartink.com/screener", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  const scanClause = `( {cash} ( daily close > daily ema(daily close, 61) and 1 day ago close <= 1 day ago ema(daily close, 61) and daily rsi(12) > 60 and 1 day ago rsi(12) <= 60 ) )`;

  const result = await page.evaluate(async (scanClause) => {

    // 1. Read CSRF token from meta tag
    const tokenEl = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = tokenEl ? tokenEl.getAttribute("content") : null;

    if (!csrfToken) {
      return { error: "CSRF token not found in page" };
    }

    // 2. Send request with proper headers
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

  return result.data.sort((a,b) => b.per_chg - a.per_chg).slice(0, 5);
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;