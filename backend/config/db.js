const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000, // 30s — handles high-latency connections
      socketTimeoutMS: 60000,          // 60s socket timeout
      connectTimeoutMS: 30000,         // 30s initial connection timeout
      heartbeatFrequencyMS: 20000,     // check connection every 20s (less aggressive)
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

mongoose.connection.on("error", (err) => {
  console.error("[MongoDB] Critical Error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Lost connection. Mongoose will auto-reconnect.");
});

mongoose.connection.on("reconnected", () => {
  console.log("[MongoDB] Reconnected successfully.");
});

module.exports = connectDB;