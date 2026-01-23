const express = require("express");
const tradeRoutes = require("./trade.routes");
const stockRoutes = require("./stock.routes");

const router = express.Router();

router.get("/", (req, res) => {
    res.json({ message: "API is working..." });
});

router.use("/", tradeRoutes);
router.use("/", stockRoutes);

module.exports = router;
