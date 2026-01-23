const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const kotakAuthService = require("./services/kotakAuth.service");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api", routes);

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "alive",
        timestamp: new Date().toISOString(),
        authenticated: kotakAuthService.isAuthenticated()
    });
});

// Root endpoint
app.get("/", (req, res) => {
    res.json({ message: "Kotak Trading Bot is running" });
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
