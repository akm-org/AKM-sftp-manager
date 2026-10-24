import { config } from './config.js';
import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

class UniversalDatabase {
  constructor() {
    this.type = 'sqlite';
    this.supabase = null;
    this.mongo = null;
    this.mongoDb = null;
    this.pgPool = null;
    this.sqliteDb = null;
    this.readyPromise = this.init();
  }

  async init() {
    // 1. Check MongoDB
    if (config.mongoUri) {
      try {
        console.log('🍃 Initializing MongoDB connection...');
        this.mongo = new MongoClient(config.mongoUri);
        await this.mongo.connect();
        this.mongoDb = this.mongo.db();
        this.type = 'mongodb';
        console.log('✅ Connected to MongoDB successfully.');
        return;
      } catch (err) {
        console.warn('⚠️ MongoDB connection failed, falling back:', err.message);
      }
    }

    // 2. Check Supabase (REST API)
    if (config.supabaseUrl && (config.supabaseServiceKey || config.supabaseAnonKey)) {
      try {
        console.log('⚡ Initializing Supabase REST Client...');
        const key = config.supabaseServiceKey || config.supabaseAnonKey;
        this.supabase = createClient(config.supabaseUrl, key, {
          auth: { persistSession: false },
        });
        this.type = 'supabase';
        console.log('✅ Supabase client initialized.');
      } catch (err) {
        console.warn('⚠️ Supabase init failed:', err.message);
      }
    }

    // 3. Check Postgres URL (if direct pooler URL is provided)
    if (config.postgresUrl) {
      try {
        console.log('🐘 Initializing PostgreSQL connection...');
        this.pgPool = new pg.Pool({
          connectionString: config.postgresUrl,
          ssl: { rejectUnauthorized: false },
        });
        await this.initPostgresSchema();
        this.type = 'postgres';
        console.log('✅ PostgreSQL connected.');
        return;
      } catch (err) {
        console.warn('⚠️ PostgreSQL connection failed, falling back:', err.message);
      }
    }

    // Always initialize SQLite as persistent fallback
    await this.initSqlite();
  }

  async initSqlite() {
    if (typeof Bun !== 'undefined') {
      const { Database } = await import('bun:sqlite');
      this.sqliteDb = new Database(config.dbPath, { create: true });
    } else {
      const { DatabaseSync } = await import('node:sqlite');
      this.sqliteDb = new DatabaseSync(config.dbPath);
    }
    this.initSqliteSchema();
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

  // --- MONGODB OPERATIONS ---
  async getMongo(sql, params) {
    if (sql.includes('FROM users WHERE username = ?')) {
      const u = await this.mongoDb.collection('users').findOne({ username: params[0] });
      return u ? { ...u, id: u._id.toString() } : null;
    }
    if (sql.includes('FROM users WHERE id = ?')) {
      const u = await this.mongoDb.collection('users').findOne({ _id: params[0] });
      return u ? { ...u, id: u._id.toString() } : null;
    }
    if (sql.includes('FROM connections WHERE id = ? AND user_id = ?')) {
      const c = await this.mongoDb.collection('connections').findOne({ _id: params[0], user_id: params[1] });
      return c ? { ...c, id: c._id.toString() } : null;
    }
    if (sql.includes('FROM active_sessions WHERE session_id = ?')) {
      const s = await this.mongoDb.collection('active_sessions').findOne({ session_id: params[0] });
      return s ? { ...s, id: s._id.toString() } : null;
    }
    return null;
  }

  // --- SUPABASE OPERATIONS ---
  async getSupabase(sql, params) {
    if (sql.includes('FROM users WHERE username = ?')) {
      const { data, error } = await this.supabase.from('users').select('*').eq('username', params[0]).maybeSingle();
      if (error) throw error;
      return data;
    }
    if (sql.includes('FROM users WHERE id = ?')) {
      const { data, error } = await this.supabase.from('users').select('*').eq('id', params[0]).maybeSingle();
      if (error) throw error;
      return data;
    }
    if (sql.includes('FROM connections WHERE id = ? AND user_id = ?')) {
      const { data, error } = await this.supabase.from('connections').select('*').eq('id', params[0]).eq('user_id', params[1]).maybeSingle();
      if (error) throw error;
      return data;
    }
    if (sql.includes('FROM connections WHERE user_id = ? ORDER BY id DESC LIMIT 1')) {
      const { data, error } = await this.supabase.from('connections').select('*').eq('user_id', params[0]).order('id', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    }
    if (sql.includes('FROM active_sessions WHERE session_id = ? AND user_id = ?')) {
      const { data, error } = await this.supabase.from('active_sessions').select('*').eq('session_id', params[0]).eq('user_id', params[1]).maybeSingle();
      if (error) throw error;
      return data;
    }
    return null;
  }

  async querySupabase(sql, params) {
    if (sql.includes('FROM connections WHERE user_id = ?')) {
      const { data, error } = await this.supabase.from('connections').select('*').eq('user_id', params[0]).order('id', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return [];
  }

  async runSupabase(sql, params) {
    if (sql.includes('INSERT INTO users')) {
      const { data, error } = await this.supabase.from('users').insert({
        username: params[0],
        email: params[1],
        password_hash: params[2],
      }).select().single();
      if (error) throw error;
      return data;
    }
    if (sql.includes('INSERT INTO connections')) {
      const { data, error } = await this.supabase.from('connections').insert({
        user_id: params[0],
        name: params[1],
        host: params[2],
        port: params[3],
        username: params[4],
        password_encrypted: params[5],
        auth_type: params[6],
        private_key_encrypted: params[7],
        default_path: params[8],
      }).select().single();
      if (error) throw error;
      return data;
    }
    if (sql.includes('UPDATE connections')) {
      const { error } = await this.supabase.from('connections').update({
        name: params[0],
        host: params[1],
        port: params[2],
        username: params[3],
        password_encrypted: params[4],
        auth_type: params[5],
        private_key_encrypted: params[6],
        default_path: params[7],
      }).eq('id', params[8]).eq('user_id', params[9]);
      if (error) throw error;
      return { success: true };
    }
    if (sql.includes('DELETE FROM connections')) {
      const { error } = await this.supabase.from('connections').delete().eq('id', params[0]).eq('user_id', params[1]);
      if (error) throw error;
      return { success: true };
    }
    if (sql.includes('INSERT OR REPLACE INTO active_sessions') || sql.includes('INSERT INTO active_sessions')) {
      const { error } = await this.supabase.from('active_sessions').upsert({
        session_id: params[0],
        user_id: params[1],
        host: params[2],
        port: params[3],
        username: params[4],
        password_encrypted: params[5],
        private_key_encrypted: params[6],
        initial_path: params[7],
        current_path: params[8],
      });
      if (error) throw error;
      return { success: true };
    }
    if (sql.includes('DELETE FROM active_sessions')) {
      const { error } = await this.supabase.from('active_sessions').delete().eq('session_id', params[0]);
      if (error) throw error;
      return { success: true };
    }
    if (sql.includes('UPDATE active_sessions SET current_path')) {
      const { error } = await this.supabase.from('active_sessions').update({
        current_path: params[0],
      }).eq('session_id', params[1]);
      if (error) throw error;
      return { success: true };
    }
    return null;
  }

  // --- UNIFIED PUBLIC API WITH AUTO-FALLBACK ---
  async get(sql, params = []) {
    await this.readyPromise;

    // Try Supabase first if available
    if (this.type === 'supabase' && this.supabase) {
      try {
        const res = await this.getSupabase(sql, params);
        if (res !== null) return res;
      } catch (err) {
        console.warn('⚠️ Supabase get failed, falling back to SQLite:', err.message);
      }
    }

    // Try MongoDB if available
    if (this.type === 'mongodb' && this.mongoDb) {
      try {
        const res = await this.getMongo(sql, params);
        if (res !== null) return res;
      } catch (err) {
        console.warn('⚠️ MongoDB get failed, falling back to SQLite:', err.message);
      }
    }

    // SQLite fallback
    if (!this.sqliteDb) await this.initSqlite();
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.get(...params);
  }

  async query(sql, params = []) {
    await this.readyPromise;

    if (this.type === 'supabase' && this.supabase) {
      try {
        return await this.querySupabase(sql, params);
      } catch (err) {
        console.warn('⚠️ Supabase query failed, falling back to SQLite:', err.message);
      }
    }

    if (!this.sqliteDb) await this.initSqlite();
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.all(...params);
  }

  async run(sql, params = []) {
    await this.readyPromise;

    if (this.type === 'supabase' && this.supabase) {
      try {
        const res = await this.runSupabase(sql, params);
        if (res) return res;
      } catch (err) {
        console.warn('⚠️ Supabase run failed, falling back to SQLite:', err.message);
      }
    }

    if (!this.sqliteDb) await this.initSqlite();
    const stmt = this.sqliteDb.prepare(sql);
    return stmt.run(...params);
  }

  getType() {
    return this.type;
  }
}

export const db = new UniversalDatabase();
