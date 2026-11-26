const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const voterRoutes = require("./routes/voter");
const candidateRoutes = require("./routes/candidate");
const electionRoutes = require("./routes/election");

const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Unmetered: load balancers / PM2 / k8s probes + autocannon on /health
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString(), service: "EthVote API" });
});

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
}));

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// ─── DB Connection ──────────────────────────────────────────────────────────
connectDB();

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/voter", voterRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/election", electionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;

// Local development only
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `EthVote API running on port ${PORT} [${process.env.NODE_ENV || "development"}]`
    );
  });
}

module.exports = app;