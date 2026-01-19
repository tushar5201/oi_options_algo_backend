const express = require("express");
const axios = require("axios");
const Trade = require("../models/Trade");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzer = require("./oiAnalyzer");
const scheduler = require("./scheduler");
const logger = require("../utils/logger");

const router = express.Router();
const nseIndia = new NseIndia();

// Existing routes
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

// ✅ NEW: Get today's options (selected at 3:09 PM)
router.get("/today-options", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTrades = await Trade.find({
      entryTime: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ entryTime: -1 });

    res.json({
      success: true,
      count: todayTrades.length,
      entryTime: todayTrades[0]?.entryTime,
      options: todayTrades.map(trade => ({
        tradingSymbol: trade.tradingSymbol,
        symbol: trade.symbol,
        strikePrice: trade.strikePrice,
        optionType: trade.optionType,
        entryPrice: trade.entryPrice,
        entryTime: trade.entryTime,
        quantity: trade.quantity,
        status: trade.status,
        exitPrice: trade.exitPrice,
        pnl: trade.pnl
      }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ✅ NEW: Get real-time prices for today's options
router.get("/today-options-live", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTrades = await Trade.find({
      entryTime: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (todayTrades.length === 0) {
      return res.json({
        success: true,
        message: "No trades for today",
        options: []
      });
    }

    const liveData = await Promise.all(
      todayTrades.map(async (trade) => {
        try {
          const allData = await nseIndia.getIndexOptionChain(trade.symbol);

          const matched = allData.records.data.find(d =>
            d.strikePrice.toString() === trade.strikePrice.toString()
          );

          if (!matched) {
            return {
              ...trade.toObject(),
              currentPrice: null,
              pnl: null,
              error: "Data not found"
            };
          }

          const optionData = trade.optionType === "CE" ? matched.CE : matched.PE;
          const currentPrice = optionData?.lastPrice || trade.entryPrice;

          // Calculate PnL
          let pnl = 0;
          let pnlPercent = 0;

          if (trade.status === "CLOSED" && trade.exitPrice) {
            // Use actual exit price for closed trades
            pnl = trade.pnl;
            pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
          } else {
            // Use current price for open trades
            pnl = (currentPrice - trade.entryPrice) * trade.quantity;
            pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
          }

          return {
            tradingSymbol: trade.tradingSymbol,
            symbol: trade.symbol,
            strikePrice: trade.strikePrice,
            optionType: trade.optionType,
            entryPrice: trade.entryPrice,
            currentPrice: currentPrice,
            entryTime: trade.entryTime,
            quantity: trade.quantity,
            status: trade.status,
            exitPrice: trade.exitPrice,
            exitTime: trade.exitTime,
            pnl: pnl,
            pnlPercent: pnlPercent,
            change: optionData?.change,
            volume: optionData?.totalTradedVolume,
            oi: optionData?.openInterest
          };

        } catch (error) {
          return {
            ...trade.toObject(),
            currentPrice: trade.entryPrice,
            pnl: 0,
            error: error.message
          };
        }
      })
    );

    const totalPnL = liveData.reduce((sum, opt) => sum + (opt.pnl || 0), 0);

    res.json({
      success: true,
      count: liveData.length,
      totalPnL: totalPnL,
      options: liveData,
      lastUpdated: new Date()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Enhanced /data endpoint
router.post("/data", async (req, res) => {
  try {
    const { expiryDate, strikePrice, optionType, symbol } = req.body;
    const allData = await nseIndia.getIndexOptionChain(symbol);

    const matched = allData.records.data.find(d =>
      d.expiryDate.toString() === expiryDate &&
      d.strikePrice.toString() === strikePrice
    );

    if (!matched) {
      return res.status(404).json({ error: "Option not found" });
    }

    const optionData = optionType === "CE" ? matched.CE : matched.PE;

    return res.json({
      price: optionData?.lastPrice,
      change: optionData?.change,
      pChange: optionData?.pChange,
      volume: optionData?.totalTradedVolume,
      oi: optionData?.openInterest,
      timestamp: new Date()
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/oi-data", async (req, res) => {
  const data = await oiAnalyzer.analyzeAndSelectOptions();
  return res.json(data);
});

router.post("/test-entry", async (req, res) => {
  try {
    const kotakTrading = require("./kotakTrading");
    const oiAnalyzer = require("./oiAnalyzer");

    logger.info("🧪 TEST: Fetching OI data...");
    const options = await oiAnalyzer.analyzeAndSelectOptions();

    logger.info(`✅ Found ${options.length} options:`, options);

    if (options.length === 0) {
      return res.json({
        success: false,
        message: "No options selected",
        options: []
      });
    }

    logger.info("🧪 TEST: Executing entry...");
    await kotakTrading.executeEntry(options);

    // Check what was saved
    const savedTrades = await Trade.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      optionsSelected: options.length,
      options: options,
      savedTrades: savedTrades
    });

  } catch (err) {
    logger.error("Test entry failed:", err.message);
    logger.error("Stack:", err.stack);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

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