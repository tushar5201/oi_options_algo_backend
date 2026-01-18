const express = require("express");
const axios = require("axios");
const Trade = require("../models/Trade");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzer = require("./oiAnalyzer");
const scheduler = require("./scheduler");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const fetchTopStocksPuppeteer = require("./chartInkScanner");
const fetchTopStocksPlaywright = require("./chartInkScanner");

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

router.get("/top-stocks", async (req, res) => {
  try {
    const stocks = await fetchTopStocksPlaywright();
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