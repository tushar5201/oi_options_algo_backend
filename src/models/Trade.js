// models/Trade.js
const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema({
    orderId: String,
    symbol: String,
    tradingSymbol: String,
    strikePrice: Number,
    optionType: String,

    entryPrice: Number,
    exitPrice: Number,
    quantity: Number,

    entryTime: Date,
    exitTime: Date,

    pnl: Number,
    status: String,
    paperTrade: Boolean
}, { timestamps: true });

module.exports = mongoose.model("Trade", tradeSchema);
