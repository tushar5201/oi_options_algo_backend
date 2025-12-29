const express = require("express");
const kotakTrading = require("./kotakTrading");

const router = express.Router();

router.get("/", (req, res) => {
    res.json("working...");
});

router.get("/api/trades", (req, res) => {
    const { data, status, page = 1, limit = 50 } = req.query;
    let trades = kotakTrading.getAllPositions();

    if (status) {
        trades = trades.filter(t => t.status === status.toUpperCase());
    }
    if (date) {
        const selectedDate = new Date(date);
        trades = trades.filter(trade => {
            const tradeDate = new Date(trade.entryTime || trade.exitTime);
            return tradeDate.toDateString() === selectedDate.toDateString();
        });
    }

    const total = trades.length;
    const paginated = trades.slice((page - 1) * limit, page * limit);

    res.json({
        trades: paginated,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        filters: { data, status }
    });
});

// Get Summary
router.get("/api/summary", (req, res) => {
    const { period = "today", date } = req.query;
    const summary = kotakTrading.getSummary({ date, period });
    res.json(summary);
});

// Get open positions
router.get("/api/posotions", (req, res) => {
    res.json(kotakTrading.getOpenPositions());
})

module.exports = router;
