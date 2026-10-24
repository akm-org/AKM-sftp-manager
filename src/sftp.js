import Client from 'ssh2-sftp-client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { db } from './db.js';
import { encrypt, decrypt } from './crypto.js';

// In-memory cache of active SFTP sessions: sessionId -> { client, info, lastUsed, timeoutTimer }
const sessions = new Map();

export class SFTPManager {
  static formatPath(p) {
    if (!p) return '/';
    let normalized = path.posix.normalize(p.trim());
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    return normalized;
  }

  static async getSession(sessionId, userId) {
    let session = sessions.get(sessionId);

    // If session exists in-memory and belongs to user
    if (session) {
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session.');
      }
      session.lastUsed = Date.now();
      this.resetSessionTimeout(sessionId);
      return session;
    }

    // In a serverless environment (like Vercel), the lambda might have restarted.
    // Recover session from database:
    const row = await db.get('SELECT * FROM active_sessions WHERE session_id = ? AND user_id = ?', [sessionId, userId]);
    if (!row) {
      throw new Error('SFTP session expired or not found. Please reconnect.');
    }

    // Re-establish connection
    const client = new Client();
    const connectOptions = {
      host: row.host.trim(),
      port: parseInt(row.port, 10) || 22,
      username: row.username.trim(),
      readyTimeout: 15000,
      keepaliveInterval: 15000,
    };

    if (row.private_key_encrypted) {
      connectOptions.privateKey = decrypt(row.private_key_encrypted);
    } else if (row.password_encrypted) {
      connectOptions.password = decrypt(row.password_encrypted);
    }

    try {
      await client.connect(connectOptions);

      session = {
        sessionId,
        userId,
        client,
        info: {
          host: row.host,
          port: row.port,
          username: row.username,
          name: `${row.username}@${row.host}`,
          connectedAt: row.last_used_at,
          initialPath: row.initial_path,
        },
        currentPath: row.current_path || row.initial_path || '/',
        lastUsed: Date.now(),
        timeoutTimer: null,
      };

      sessions.set(sessionId, session);
      this.resetSessionTimeout(sessionId);
      return session;
    } catch (err) {
      // Remove stale record from database if re-connect fails
      try {
        await db.run('DELETE FROM active_sessions WHERE session_id = ?', [sessionId]);
      } catch (e) {}
      throw new Error(`Failed to reconnect to SFTP: ${err.message}`);
    }
  }

  static resetSessionTimeout(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    session.timeoutTimer = setTimeout(async () => {
      console.log(`[SFTP] Session ${sessionId} timed out.`);
      await this.disconnect(sessionId);
    }, config.sessionTimeoutMs);
  }

  static async testConnection({ host, port, username, password, privateKey }) {
    const client = new Client();
    const startTime = Date.now();
    try {
      const connectOptions = {
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        readyTimeout: 12000,
        keepaliveInterval: 10000,
      };

      if (privateKey) {
        connectOptions.privateKey = privateKey;
      } else if (password) {
        connectOptions.password = password;
      }

      await client.connect(connectOptions);
      const latencyMs = Date.now() - startTime;
      const cwd = await client.cwd();
      await client.end();
      return {
        success: true,
        latencyMs,
        workingDir: cwd || '/',
        message: 'Connected successfully to SFTP server',
      };
    } catch (err) {
      try {
        await client.end();
      } catch (e) {}
      return {
        success: false,
        error: err.message || 'Connection failed',
      };
    }
  }

  static async createSession(userId, connectionConfig) {
    const client = new Client();
    const sessionId = crypto.randomUUID();

    const connectOptions = {
      host: connectionConfig.host.trim(),
      port: parseInt(connectionConfig.port, 10) || 22,
      username: connectionConfig.username.trim(),
      readyTimeout: 15000,
      keepaliveInterval: 15000,
    };

    if (connectionConfig.privateKey) {
      connectOptions.privateKey = connectionConfig.privateKey;
    } else if (connectionConfig.password) {
      connectOptions.password = connectionConfig.password;
    }

    try {
      await client.connect(connectOptions);
      let initialPath = connectionConfig.defaultPath || '/';
      try {
        const cwd = await client.cwd();
        if (cwd && (!initialPath || initialPath === '/')) {
          initialPath = cwd;
        }
      } catch (e) {
        initialPath = '/';
      }

      const sessionData = {
        sessionId,
        userId,
        client,
        info: {
          host: connectionConfig.host,
          port: connectionConfig.port || 22,
          username: connectionConfig.username,
          name: connectionConfig.name || connectionConfig.host,
          connectedAt: new Date().toISOString(),
          initialPath,
        },
        currentPath: initialPath,
        lastUsed: Date.now(),
        timeoutTimer: null,
      };

      sessions.set(sessionId, sessionData);
      this.resetSessionTimeout(sessionId);

      // Save encrypted session to SQLite for serverless recovery
      try {
        const encPass = connectionConfig.password ? encrypt(connectionConfig.password) : null;
        const encKey = connectionConfig.privateKey ? encrypt(connectionConfig.privateKey) : null;
        await db.run(
          `INSERT OR REPLACE INTO active_sessions (session_id, user_id, host, port, username, password_encrypted, private_key_encrypted, initial_path, current_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, userId, connectionConfig.host, connectionConfig.port || 22, connectionConfig.username, encPass, encKey, initialPath, initialPath]
        );
      } catch (dbErr) {
        console.warn('Could not persist session in db:', dbErr.message);
      }

      return {
        sessionId,
        info: sessionData.info,
      };
    } catch (err) {
      try {
        await client.end();
      } catch (e) {}
      throw new Error(`SFTP Connection failed: ${err.message}`);
    }
  }

  static async disconnect(sessionId, userId = null) {
    const session = sessions.get(sessionId);
    if (session && userId && session.userId !== userId) {
      throw new Error('Unauthorized access.');
    }

    if (session) {
      if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
      try {
        await session.client.end();
      } catch (err) {}
      sessions.delete(sessionId);
    }

    try {
      if (userId) {
        await db.run('DELETE FROM active_sessions WHERE session_id = ? AND user_id = ?', [sessionId, userId]);
      } else {
        await db.run('DELETE FROM active_sessions WHERE session_id = ?', [sessionId]);
      }
    } catch (e) {}

    return { message: 'Disconnected successfully' };
  }

  static async list(sessionId, userId, remotePath = null) {
    const session = await this.getSession(sessionId, userId);
    const targetPath = this.formatPath(remotePath || session.currentPath || '/');

    try {
      const rawList = await session.client.list(targetPath);
      session.currentPath = targetPath;

      // Update in db
      try {
        await db.run('UPDATE active_sessions SET current_path = ?, last_used_at = CURRENT_TIMESTAMP WHERE session_id = ?', [targetPath, sessionId]);
      } catch (e) {}

      const items = rawList.map((item) => {
        const isDir = item.type === 'd';
        const isSymlink = item.type === 'l';
        return {
          name: item.name,
          type: item.type,
          isDirectory: isDir,
          isSymlink,
          size: item.size || 0,
          modifyTime: item.modifyTime,
          accessTime: item.accessTime,
          rights: item.rights || {},
          permissions: this.formatRights(item.rights),
        };
      });

      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      return {
        path: targetPath,
        items,
      };
    } catch (err) {
      throw new Error(`Failed to list directory '${targetPath}': ${err.message}`);
    }
  }

  static formatRights(rights) {
    if (!rights) return 'rw-r--r--';
    const u = rights.user || 'rw-';
    const g = rights.group || 'r--';
    const o = rights.other || 'r--';
    return `${u}${g}${o}`;
  }

  static async readFile(sessionId, userId, remoteFilePath) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteFilePath);

    try {
      const buffer = await session.client.get(formatted);
      return {
        path: formatted,
        content: buffer.toString('utf8'),
        size: buffer.length,
      };
    } catch (err) {
      throw new Error(`Failed to read file '${formatted}': ${err.message}`);
    }
  }

  static async writeFile(sessionId, userId, remoteFilePath, content) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteFilePath);

    try {
      const buffer = Buffer.from(content, 'utf8');
      await session.client.put(buffer, formatted);
      return {
        success: true,
        path: formatted,
        size: buffer.length,
      };
    } catch (err) {
      throw new Error(`Failed to write file '${formatted}': ${err.message}`);
    }
  }

  static async downloadFile(sessionId, userId, remoteFilePath) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteFilePath);

    try {
      const buffer = await session.client.get(formatted);
      const filename = path.posix.basename(formatted);
      return {
        buffer,
        filename,
        size: buffer.length,
      };
    } catch (err) {
      throw new Error(`Failed to download file '${formatted}': ${err.message}`);
    }
  }

  static async uploadFile(sessionId, userId, localFilePath, remoteDirPath, originalFilename) {
    const session = await this.getSession(sessionId, userId);
    const dir = this.formatPath(remoteDirPath);
    const remoteDest = path.posix.join(dir, originalFilename);

    try {
      await session.client.fastPut(localFilePath, remoteDest);
      return {
        success: true,
        path: remoteDest,
        name: originalFilename,
      };
    } catch (err) {
      try {
        const fileData = fs.readFileSync(localFilePath);
        await session.client.put(fileData, remoteDest);
        return {
          success: true,
          path: remoteDest,
          name: originalFilename,
        };
      } catch (innerErr) {
        throw new Error(`Failed to upload to '${remoteDest}': ${innerErr.message}`);
      }
    }
  }

  static async mkdir(sessionId, userId, remoteDirPath) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteDirPath);

    try {
      await session.client.mkdir(formatted, true);
      return { success: true, path: formatted };
    } catch (err) {
      throw new Error(`Failed to create directory '${formatted}': ${err.message}`);
    }
  }

  static async createFile(sessionId, userId, remoteFilePath) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteFilePath);

    try {
      await session.client.put(Buffer.from(''), formatted);
      return { success: true, path: formatted };
    } catch (err) {
      throw new Error(`Failed to create empty file '${formatted}': ${err.message}`);
    }
  }

  static async rename(sessionId, userId, oldPath, newPath) {
    const session = await this.getSession(sessionId, userId);
    const fromPath = this.formatPath(oldPath);
    const toPath = this.formatPath(newPath);

    try {
      await session.client.rename(fromPath, toPath);
      return { success: true, oldPath: fromPath, newPath: toPath };
    } catch (err) {
      throw new Error(`Failed to rename '${fromPath}' to '${toPath}': ${err.message}`);
    }
  }

  static async chmod(sessionId, userId, remotePath, mode) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remotePath);

    try {
      const octalMode = parseInt(mode, 8);
      await session.client.chmod(formatted, octalMode);
      return { success: true, path: formatted, mode };
    } catch (err) {
      throw new Error(`Failed to chmod '${formatted}' to ${mode}: ${err.message}`);
    }
  }

  static async delete(sessionId, userId, remotePath, isDirectory = false) {
    const session = await this.getSession(sessionId, userId);
    const formatted = this.formatPath(remotePath);

    try {
      if (isDirectory) {
        await session.client.rmdir(formatted, true);
      } else {
        await session.client.delete(formatted);
      }
      return { success: true, path: formatted };
    } catch (err) {
      try {
        if (!isDirectory) {
          await session.client.rmdir(formatted, true);
          return { success: true, path: formatted };
        }
      } catch (e) {}
      throw new Error(`Failed to delete '${formatted}': ${err.message}`);
    }
  }

  static async getActiveSession(sessionId, userId) {
    try {
      const session = await this.getSession(sessionId, userId);
      return {
        sessionId: session.sessionId,
        info: session.info,
        currentPath: session.currentPath,
        connectedAt: session.info.connectedAt,
      };
    } catch (e) {
      return null;
    }
  }
}
