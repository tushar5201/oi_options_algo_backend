require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/database");
const logger = require("./src/utils/logger");
const kotakAuthService = require("./src/services/kotakAuth.service");
const schedulerService = require("./src/services/scheduler.service");
const { initializeWebSocket } = require("./src/services/websocket.service");
const config = require("./src/config/config");

async function startServer() {
    try {
        logger.info("====================================");
        logger.info("🚀 KOTAK OPTIONS BOT STARTING");
        logger.info("====================================");

        // Connect to database
        await connectDB();

        // Authenticate with Kotak
        await kotakAuthService.authenticate();
        logger.info("✅ Kotak login successful");

        // Start scheduler
        schedulerService.start();

        // Create HTTP server
        const server = http.createServer(app);

        // Initialize WebSocket
        initializeWebSocket(server);

        // Start server
        server.listen(config.server.port, () => {
            logger.info(`✅ Server running on port ${config.server.port}`);
            logger.info("⏳ Bot running...");
            logger.info("Entry: Mon–Thu 3:15 PM");
            logger.info("Exit: Tue–Fri 9:30 AM");
        });
    } catch (err) {
        logger.error("Startup failed:", err.response?.data?.message || err.message || err);
        process.exit(1);
    }
}

startServer();
