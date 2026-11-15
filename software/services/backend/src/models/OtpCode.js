const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * One-time codes for phone/email sign-in.
 *
 * The code itself is never stored in plain text — only a bcrypt hash, the same
 * way a password is handled. Documents expire on their own via a TTL index, so
 * nothing has to sweep them.
 */
const otpCodeSchema = new mongoose.Schema(
  {
    // Phone number or email the code was sent to
    identifier: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    code_hash: {
      type: String,
      required: true,
      select: false,
    },
    channel: {
      type: String,
      required: true,
      enum: ["sms", "email"],
      default: "sms",
    },
    // Wrong guesses so far — the code dies after MAX_ATTEMPTS
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    // How many times a fresh code was requested for this identifier in the window
    sends: {
      type: Number,
      default: 1,
      min: 1,
    },
    consumed_at: {
      type: Date,
      default: null,
    },
    req_id: {
      type: String,
      default: null,
    },
    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// Mongo removes the document once expires_at passes.
otpCodeSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
// Newest live code for an identifier — the only lookup we do.
otpCodeSchema.index({ identifier: 1, created_at: -1 });

otpCodeSchema.statics.hashCode = async function (code) {
  return bcrypt.hash(code, 10);
};

otpCodeSchema.methods.matches = async function (code) {
  return bcrypt.compare(String(code), this.code_hash);
};

module.exports = mongoose.model("OtpCode", otpCodeSchema);
