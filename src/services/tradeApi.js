const express = require("express");
const axios = require("axios");
const Papa = require("papaparse");
const Trade = require("../models/Trade");
const kotakAuth = require("./kotakAuth");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzer = require("./oiAnalyzer");
const scheduler = require("./scheduler");
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

router.get("/data", async (req, res) => {
    try {
        const symbol = await oiAnalyzer.analyzeAndSelectOptions();
        const allData = await nseIndia.getIndexOptionChain(symbol[0].symbol);

        const { expiryDate, strikePrice, optionType } = symbol[0];

        const matched = allData.records.data.find(d =>
            d.expiryDates === expiryDate &&
            d.strikePrice === strikePrice
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
})

module.exports = router;