/**
 * OpenClaw device identity loader and Ed25519 signing helpers.
 * Mirrors the openclaw CLI's device auth protocol (v3).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

const IDENTITY_DIR = path.join(os.homedir(), ".openclaw", "identity");
const IDENTITY_FILE = path.join(IDENTITY_DIR, "device.json");

/**
 * Loads existing device identity from ~/.openclaw/identity/device.json,
 * or generates a new Ed25519 keypair if none exists.
 */
export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  if (fs.existsSync(IDENTITY_FILE)) {
    const raw = fs.readFileSync(IDENTITY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DeviceIdentity;
    if (parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
      return parsed;
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const deviceId = fingerprintPublicKey(publicKey);
  const identity: DeviceIdentity = {
    deviceId,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };

  fs.mkdirSync(IDENTITY_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), "utf-8");

  return identity;
}

/**
 * Signs a UTF-8 payload with an Ed25519 private key, returns base64url.
 */
export function signDevicePayload(
  privateKeyPem: string,
  payload: string,
): string {
  const sig = crypto.sign(null, Buffer.from(payload, "utf-8"), privateKeyPem);
  return sig.toString("base64url");
}

/**
 * Extracts the raw 32-byte public key from a SPKI PEM and returns it as base64url.
 * Ed25519 SPKI DER is 44 bytes: 12-byte header + 32-byte raw key.
 */
export function publicKeyRawBase64Url(publicKeyPem: string): string {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const der = keyObj.export({ type: "spki", format: "der" });
  // Last 32 bytes of SPKI DER are the raw Ed25519 public key
  const raw = der.subarray(der.length - 32);
  return raw.toString("base64url");
}

/**
 * SHA-256 hex digest of the raw 32-byte public key.
 * This is how openclaw derives the deviceId.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const der = keyObj.export({ type: "spki", format: "der" });
  const raw = der.subarray(der.length - 32);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface DeviceAuthV3Params {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAt: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily: string;
}

/**
 * Normalizes platform/deviceFamily metadata to match gateway verification.
 * The gateway lowercases and trims these fields before rebuilding the signing payload.
 */
function normalizeDeviceMetadata(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Builds the v3 pipe-delimited signing input:
 * "v3|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce|platform|deviceFamily"
 */
export function buildDeviceAuthPayloadV3(params: DeviceAuthV3Params): string {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAt),
    params.token ?? "",
    params.nonce,
    normalizeDeviceMetadata(params.platform),
    normalizeDeviceMetadata(params.deviceFamily),
  ].join("|");
}
