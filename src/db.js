import { config } from './config.js';
import path from 'path';
import fs from 'fs';

let rawDb = null;

if (typeof Bun !== 'undefined') {
  const { Database } = await import('bun:sqlite');
  rawDb = new Database(config.dbPath, { create: true });
} else {
  const { DatabaseSync } = await import('node:sqlite');
  rawDb = new DatabaseSync(config.dbPath);
}

// Database wrapper providing clean interface
class DBWrapper {
  constructor(db) {
    this.db = db;
  }

  exec(sql) {
    if (typeof this.db.run === 'function' && typeof Bun !== 'undefined') {
      return this.db.run(sql);
    }
    return this.db.exec(sql);
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }
}

export const db = new DBWrapper(rawDb);

// Initialize schema
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      password_encrypted TEXT,
      auth_type TEXT NOT NULL DEFAULT 'password',
      private_key_encrypted TEXT,
      default_path TEXT DEFAULT '/',
      last_connected_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      password_encrypted TEXT,
      private_key_encrypted TEXT,
      initial_path TEXT DEFAULT '/',
      current_path TEXT DEFAULT '/',
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON active_sessions(user_id);
  `);
}

// Initialize tables on import
initSchema();
