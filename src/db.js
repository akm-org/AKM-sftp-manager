import { config } from './config.js';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

const isPostgres = !!config.postgresUrl;

class UniversalDB {
  constructor() {
    this.isPostgres = isPostgres;
    this.pgPool = null;
    this.sqliteDb = null;
    this.readyPromise = this.init();
  }

  async init() {
    if (this.isPostgres) {
      console.log('📦 Initializing Supabase / PostgreSQL Database Connection...');
      this.pgPool = new pg.Pool({
        connectionString: config.postgresUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      await this.initPostgresSchema();
    } else {
      if (typeof Bun !== 'undefined') {
        const { Database } = await import('bun:sqlite');
        this.sqliteDb = new Database(config.dbPath, { create: true });
      } else {
        const { DatabaseSync } = await import('node:sqlite');
        this.sqliteDb = new DatabaseSync(config.dbPath);
      }
      this.initSqliteSchema();
    }
  }

  async initPostgresSchema() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255),
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username VARCHAR(255) NOT NULL,
        password_encrypted TEXT,
        auth_type VARCHAR(50) NOT NULL DEFAULT 'password',
        private_key_encrypted TEXT,
        default_path TEXT DEFAULT '/',
        last_connected_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS active_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        host VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username VARCHAR(255) NOT NULL,
        password_encrypted TEXT,
        private_key_encrypted TEXT,
        initial_path TEXT DEFAULT '/',
        current_path TEXT DEFAULT '/',
        last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON active_sessions(user_id);
    `;
    await this.pgPool.query(sql);
  }

  initSqliteSchema() {
    const sql = `
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
    `;

    if (typeof this.sqliteDb.run === 'function' && typeof Bun !== 'undefined') {
      this.sqliteDb.run(sql);
    } else {
      this.sqliteDb.exec(sql);
    }
  }

  convertPlaceholders(sql) {
    let index = 1;
    let converted = sql.replace(/\?/g, () => `$${index++}`);

    // Convert SQLite INSERT OR REPLACE to Postgres ON CONFLICT
    if (this.isPostgres) {
      if (converted.includes('INSERT OR REPLACE INTO active_sessions')) {
        converted = converted.replace(
          'INSERT OR REPLACE INTO active_sessions (session_id, user_id, host, port, username, password_encrypted, private_key_encrypted, initial_path, current_path)',
          `INSERT INTO active_sessions (session_id, user_id, host, port, username, password_encrypted, private_key_encrypted, initial_path, current_path)
           ON CONFLICT (session_id) DO UPDATE SET
             host = EXCLUDED.host,
             port = EXCLUDED.port,
             username = EXCLUDED.username,
             password_encrypted = EXCLUDED.password_encrypted,
             private_key_encrypted = EXCLUDED.private_key_encrypted,
             initial_path = EXCLUDED.initial_path,
             current_path = EXCLUDED.current_path,
             last_used_at = CURRENT_TIMESTAMP`
        );
      }
    }
    return converted;
  }

  async exec(sql) {
    await this.readyPromise;
    if (this.isPostgres) {
      return this.pgPool.query(sql);
    }
    if (typeof this.sqliteDb.run === 'function' && typeof Bun !== 'undefined') {
      return this.sqliteDb.run(sql);
    }
    return this.sqliteDb.exec(sql);
  }

  async get(sql, params = []) {
    await this.readyPromise;
    if (this.isPostgres) {
      const pgSql = this.convertPlaceholders(sql);
      const res = await this.pgPool.query(pgSql, params);
      return res.rows[0] || null;
    }
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.get(...params);
  }

  async query(sql, params = []) {
    await this.readyPromise;
    if (this.isPostgres) {
      const pgSql = this.convertPlaceholders(sql);
      const res = await this.pgPool.query(pgSql, params);
      return res.rows;
    }
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.all(...params);
  }

  async run(sql, params = []) {
    await this.readyPromise;
    if (this.isPostgres) {
      const pgSql = this.convertPlaceholders(sql);
      const res = await this.pgPool.query(pgSql, params);
      return { rowCount: res.rowCount };
    }
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.run(...params);
  }
}

export const db = new UniversalDB();
