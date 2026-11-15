/**
 * MSG91 OTP service — thin wrapper over the official
 * `@msg91comm/sendotp-react-native` SDK.
 *
 * Why a wrapper:
 *   - Keeps screen call-sites unchanged (`sendOtp`, `verifyOtp`, `resendOtp`).
 *   - Hides the reqId session bookkeeping: sendOtp captures the reqId from
 *     the response and verifyOtp/resendOtp consume it automatically.
 *   - Normalizes phone format (10-digit Indian → "91XXXXXXXXXX").
 *   - Maps SDK responses (`{ type: "success" | "error", message }`) and
 *     fetch failures into a single `Msg91Error` shape that the screens
 *     already handle.
 *
 * Native side: the SDK's BiometricAuth bridge is autolinked on first build
 * after `npm install`. The OTP path itself is pure JS (fetch under the
 * hood) and works without any native bridge.
 */

import { OTPWidget } from '@msg91comm/sendotp-react-native';

const MSG91_WIDGET_ID = '3664796e4949363136393631';
const MSG91_TOKEN_AUTH = '511716TacMwxo469ecd171P1';
const COUNTRY_CODE = '91';

let initialized = false;

/** Idempotent — safe to call from app root and from callers as a guard. */
export const initializeMsg91 = () => {
  if (initialized) return;
  OTPWidget.initializeWidget(MSG91_WIDGET_ID, MSG91_TOKEN_AUTH);
  initialized = true;
};

const toMsg91Identifier = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith(COUNTRY_CODE)) return digits;
  return `${COUNTRY_CODE}${digits}`;
};

export class Msg91Error extends Error {
  constructor(message, code, raw) {
    super(message);
    this.name = 'Msg91Error';
    this.code = code;
    this.raw = raw;
  }
}

/** Tracks the reqId from the most recent sendOtp; consumed by verify/resend. */
let activeReqId = null;
/** Tracks the phone used in the most recent sendOtp so resend can fall
 *  back to a fresh sendOtp if MSG91's retryOTP rejects (some widget
 *  configurations disable retry-on-same-channel after the first send). */
let lastIdentifier = null;

const callSdk = async (
  fn,
  networkMessage = 'Please check your internet connection and try again.',
) => {
  let res;
  try {
    res = await fn();
  } catch (e) {
    throw new Msg91Error(networkMessage, 'NETWORK_ERROR', e && e.message);
  }
  if (!res || typeof res !== 'object') {
    throw new Msg91Error('Something went wrong. Please try again.', 'BAD_RESPONSE', res);
  }
  if (res.type === 'error') {
    const friendly =
      typeof res.message === 'string' && res.message.length > 0
        ? res.message
        : 'OTP request failed';
    throw new Msg91Error(friendly, 'MSG91_ERROR', res);
  }
  return res;
};

/**
 * Send an OTP to the given Indian phone number.
 * Captures `reqId` from the response so verifyOtp / resendOtp can find
 * this OTP session without the caller having to thread it through.
 */
export const sendOtp = async (phone) => {
  initializeMsg91();
  activeReqId = null;
  const identifier = toMsg91Identifier(phone);
  lastIdentifier = identifier;
  const res = await callSdk(() => OTPWidget.sendOTP({ identifier }));
  const reqId =
    typeof res.message === 'string' ? res.message : res.reqId || null;
  if (typeof reqId === 'string' && reqId.length > 0) {
    activeReqId = reqId;
  }
  return { ...res, reqId: activeReqId };
};

/** Verify the OTP for the active session created by the most recent sendOtp. */
export const verifyOtp = (otp) => {
  initializeMsg91();
  if (!activeReqId) {
    return Promise.reject(
      new Msg91Error(
        'Please request a new code before verifying.',
        'NO_ACTIVE_REQUEST',
      ),
    );
  }
  return callSdk(() => OTPWidget.verifyOTP({ reqId: activeReqId, otp }));
};

/**
 * Resend OTP for the active session.
 * Channel codes (per SDK): 11=SMS, 4=Voice, 12=WhatsApp, 3=Email.
 * Pass null/undefined to use the widget's default configured channel.
 *
 * Falls back to a fresh sendOtp() if retryOTP fails — some widget
 * configurations disable retry on the same channel after the first
 * send, so this guarantees the user always gets a new code as long as
 * the original phone is known.
 */
export const resendOtp = async (retryChannel = 11) => {
  initializeMsg91();
  if (activeReqId) {
    try {
      const body = { reqId: activeReqId };
      if (retryChannel != null) body.retryChannel = retryChannel;
      return await callSdk(() => OTPWidget.retryOTP(body));
    } catch (err) {
      // Retry rejected — fall through to fresh sendOtp below if we have
      // a phone number cached. Otherwise re-throw the original error.
      if (!lastIdentifier) throw err;
    }
  }
  if (!lastIdentifier) {
    throw new Msg91Error(
      'Please request a new code first.',
      'NO_ACTIVE_REQUEST',
    );
  }
  // Re-issue a brand new OTP session; sendOtp resets activeReqId.
  return sendOtp(lastIdentifier);
};

/** Test-only: clear the cached reqId. Not used by app code. */
export const __resetForTest = () => {
  activeReqId = null;
};
