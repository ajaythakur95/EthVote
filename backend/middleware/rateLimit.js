const rateLimit = require("express-rate-limit");

// Strict limiter for OTP endpoints
exports.otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body.aadhaarNumber || req.ip,
  message: { error: "Too many OTP requests. Please wait 10 minutes before trying again." },
  skip: () => process.env.NODE_ENV === "test",
});

// General API limiter
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP." },
  skip: () => process.env.NODE_ENV === "test",
});

// Admin action limiter
exports.adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many admin actions. Slow down." },
  skip: () => process.env.NODE_ENV === "test",
});
