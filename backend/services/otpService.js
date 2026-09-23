/**
 * Twilio Verify OTP Service
 * Used for mobile number verification (separate from Aadhaar OTP)
 * Aadhaar OTP is handled by aadhaarService.js
 */
const twilio = require("twilio");

class OTPService {
  constructor() {
    this.client = null;
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    this._init();
  }

  _init() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (sid && token && sid !== "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
      this.client = twilio(sid, token);
    } else {
      console.warn("[Twilio] Credentials not set — running in sandbox mode");
    }
  }

  /**
   * Send OTP to a mobile number via Twilio Verify
   */
  async sendOTP(phoneNumber) {
    // Normalize to E.164 format
    const e164 = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;

    if (!this.client) {
      // Sandbox: always succeed, OTP is "123456"
      console.log(`[SANDBOX Twilio] OTP for ${e164}: 123456`);
      return { success: true, sandbox: true, sandboxOtp: "123456" };
    }

    try {
      const verification = await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({ to: e164, channel: "sms" });

      return { success: true, status: verification.status };
    } catch (error) {
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  /**
   * Verify OTP entered by user
   */
  async verifyOTP(phoneNumber, code) {
    const e164 = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;

    if (!this.client) {
      // Sandbox: accept "123456" or "1234"
      return { success: code === "123456" || code === "1234", sandbox: true };
    }

    try {
      const check = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: e164, code });

      return { success: check.status === "approved", status: check.status };
    } catch (error) {
      throw new Error(`OTP verification failed: ${error.message}`);
    }
  }
}

module.exports = new OTPService();
