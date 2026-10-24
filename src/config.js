import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Generate or load encryption key
let masterKey = process.env.ENCRYPTION_KEY;
const keyFile = path.join(DATA_DIR, '.master_key');

if (!masterKey) {
  if (fs.existsSync(keyFile)) {
    masterKey = fs.readFileSync(keyFile, 'utf8').trim();
  } else {
    masterKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, masterKey, { mode: 0o600 });
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'akm_sftp_secure_jwt_secret_token_key_2026',
  encryptionKey: masterKey,
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'sftp_manager.db'),
  defaultSftpHost: process.env.DEFAULT_SFTP_HOST || '',
  defaultSftpPort: parseInt(process.env.DEFAULT_SFTP_PORT || '22', 10),
  defaultSftpUsername: process.env.DEFAULT_SFTP_USERNAME || '',
  sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '1800000', 10), // 30 minutes
};
