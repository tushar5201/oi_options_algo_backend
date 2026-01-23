const express = require("express");
const tradeController = require("../controllers/trade.controller");
const router = express.Router();

router.get("/", tradeController.getAllTrades);
router.get("/open", tradeController.getOpenTrades);
router.get("/latest-entry-options", tradeController.getLatestEntryOptions);
router.get("/latest-entry-options-live", tradeController.getLatestEntryOptionsLive);
router.get("/entry-sessions", tradeController.getEntrySessions);
router.get("/oi-data", tradeController.getOIData);
router.post("/test-entry", tradeController.testEntry);

module.exports = router;
