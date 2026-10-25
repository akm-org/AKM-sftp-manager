import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config();

const isVercel = !!process.env.VERCEL;
const defaultDataDir = isVercel ? '/tmp/data' : path.resolve(process.cwd(), 'data');
const DATA_DIR = process.env.DATA_DIR || defaultDataDir;

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

const STABLE_ENCRYPTION_KEY = 'akm_sftp_production_master_vault_key_aes256_secure_2026_x99';
const masterKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || STABLE_ENCRYPTION_KEY;

export const config = {
  isVercel,
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'akm_sftp_secure_jwt_secret_token_key_2026',
  encryptionKey: masterKey,
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'sftp_manager.db'),
  postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URL || '',
  defaultSftpHost: process.env.DEFAULT_SFTP_HOST || '',
  defaultSftpPort: parseInt(process.env.DEFAULT_SFTP_PORT || '22', 10),
  defaultSftpUsername: process.env.DEFAULT_SFTP_USERNAME || '',
  sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '1800000', 10),
};
