require("dotenv").config();
const logger = require("./utils/logger");
const kotakAuth = require("./services/kotakAuth");
const scheduler = require("./services/scheduler");
const { default: mongoose } = require("mongoose");
const express = require("express");
const tradeRoutes = require("./services/tradeApi");
const cors = require("cors");
const http = require("http");
const { initializeWebSocket } = require("./services/websocketServer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log("Connected to db");
}).catch((err) => {
    console.log("Failed to connect: ", err);
});

app.use("/api", tradeRoutes);

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "alive",
        timestamp: new Date().toISOString(),
        schedulerActive: scheduler.entryJob ? true : false,
        authenticated: kotakAuth.isAuthenticated()
    });
});

// ✅ ADD ROOT ENDPOINT (in case you need it)
app.get("/", (req, res) => {
    res.json({ message: "Kotak Trading Bot is running" });
});

async function startBot() {
    try {
        logger.info("====================================");
        logger.info("🚀 KOTAK OPTIONS BOT STARTING");
        logger.info("====================================");

        await kotakAuth.authenticate();
        logger.info("✅ Kotak login successful");

        scheduler.start();

        logger.info("⏳ Bot running...");
        logger.info("Entry: Mon–Thu 3:15 PM");
        logger.info("Exit: Tue–Fri 9:30 AM");

    } catch (err) {
        logger.error("Startup failed:", err.response?.data?.message || err.message || err);
        process.exit(1);
    }
}

startBot();

const server = http.createServer(app);
initializeWebSocket(server);

server.listen(5000, () => {
    console.log("started");
});

module.exports = { app, server };
