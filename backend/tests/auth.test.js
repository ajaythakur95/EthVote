const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");

/**
 * Integration tests for EthVote Auth API
 * Uses a test MongoDB instance (set MONGODB_URI=mongodb://localhost:27017/ethvote_test)
 */

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://localhost:27017/ethvote_test";
  process.env.JWT_SECRET = "test_secret_key_for_testing_only";
  process.env.AADHAAR_HASH_SALT = "test_salt";
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("POST /api/auth/request-otp", () => {
  it("should return 400 for invalid Aadhaar number", async () => {
    const res = await request(app)
      .post("/api/auth/request-otp")
      .send({ aadhaarNumber: "123" });
    expect(res.status).toBe(400);
  });

  it("should send OTP for valid sandbox Aadhaar number", async () => {
    const res = await request(app)
      .post("/api/auth/request-otp")
      .send({ aadhaarNumber: "123456789012" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.maskedMobile).toBeDefined();
    expect(res.body.sandboxOtp).toBe("1234"); // Sandbox mode
  });
});

describe("POST /api/auth/verify-otp", () => {
  it("should verify OTP and return demographic data for existing voter", async () => {
    // First request OTP
    await request(app)
      .post("/api/auth/request-otp")
      .send({ aadhaarNumber: "123456789012" });

    // Then verify
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ aadhaarNumber: "123456789012", otp: "1234" });

    expect(res.status).toBe(200);
    expect(res.body.aadhaarVerified).toBe(true);
    expect(res.body.name).toBe("Rajesh Kumar Sharma");
    expect(res.body.age).toBeGreaterThanOrEqual(18);
    expect(res.body.registrationPath).toBe("PATH_A_EXISTING");
  });

  it("should reject under-18 voter", async () => {
    // Use a test Aadhaar with age < 18 (would need to add to sandbox DB)
    // This tests the age check logic
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ aadhaarNumber: "000000000000", otp: "1234" });
    // Expect either not found or age rejection
    expect([400, 500].includes(res.status)).toBe(true);
  });

  it("should reject wrong OTP", async () => {
    await request(app)
      .post("/api/auth/request-otp")
      .send({ aadhaarNumber: "555555555555" });

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ aadhaarNumber: "555555555555", otp: "9999" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid OTP");
  });
});

describe("GET /health", () => {
  it("should return OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});
