const express = require("express");
const stockController = require("../controllers/stock.controller");

const router = express.Router();

router.get("/top-stocks", stockController.getTopStocks);
router.get("/chartink-test", stockController.testChartink);

module.exports = router;
