import crypto from 'crypto';
import { config } from './config.js';

// Derive fixed 32-byte key from config.encryptionKey
const KEY = crypto.createHash('sha256').update(config.encryptionKey).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const CANDIDATE_KEYS = [
  config.encryptionKey,
  'akm_sftp_production_master_vault_key_aes256_secure_2026_x99',
  '460e430704b4c09f39156db522c908c66fafd67f1dd5373cdde24f55b66716db',
  'akm_sftp_secure_jwt_secret_token_key_2026',
  'fallback_master_encryption_key_32_bytes_long_123',
].filter(Boolean);

export function encrypt(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(cipherPayload) {
  if (!cipherPayload) return '';
  
  // If not formatted as iv:authTag:cipher, it might be unencrypted plaintext
  if (!cipherPayload.includes(':')) {
    return cipherPayload;
  }
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    return cipherPayload;
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  // Try all candidate keys
  for (const rawKey of CANDIDATE_KEYS) {
    try {
      const derivedKey = crypto.createHash('sha256').update(rawKey).digest();
      const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      // continue to next key
    }
  }

  throw new Error('Failed to decrypt stored credentials');
}
