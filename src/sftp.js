import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';
import { Writable, Readable } from 'stream';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { db } from './db.js';
import { encrypt, decrypt } from './crypto.js';

// In-memory cache of active sessions: sessionId -> { type: 'sftp'|'ftp', client, info, lastUsed, timeoutTimer }
const sessions = new Map();
// Per-session execution mutex queue to prevent concurrency collisions on sockets (especially FTP)
const sessionLocks = new Map();

export class SFTPManager {
  static formatPath(p) {
    if (!p) return '/';
    let normalized = path.posix.normalize(p.trim());
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    return normalized;
  }

  static detectProtocol(port, explicitProtocol = null) {
    if (explicitProtocol && (explicitProtocol === 'ftp' || explicitProtocol === 'sftp')) {
      return explicitProtocol;
    }
    const p = parseInt(port, 10);
    return p === 21 ? 'ftp' : 'sftp';
  }

  static async getSession(sessionId, userId) {
    let session = sessions.get(sessionId);

    if (session) {
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session.');
      }

      let isDead = false;
      if (session.protocol === 'ftp') {
        if (session.client.closed || !session.client.ftp?.socket || session.client.ftp.socket.destroyed) {
          isDead = true;
        }
      } else if (session.protocol === 'sftp') {
        if (!session.client.sftp || session.client.sftp.destroyed) {
          isDead = true;
        }
      }

      if (isDead) {
        console.log(`[SFTPManager] Stale/closed client detected for session ${sessionId}, purging and reconnecting.`);
        try {
          if (session.protocol === 'ftp') session.client.close();
          else await session.client.end();
        } catch (e) {}
        sessions.delete(sessionId);
        session = null;
      }
    }

    if (session) {
      session.lastUsed = Date.now();
      this.resetSessionTimeout(sessionId);
      return session;
    }

    // Recover session from database
    const row = await db.get('SELECT * FROM active_sessions WHERE session_id = ? AND user_id = ?', [sessionId, userId]);
    if (!row) {
      throw new Error('Session expired or not found. Please reconnect.');
    }

    const protocol = row.protocol || this.detectProtocol(row.port);
    const password = row.password_encrypted ? decrypt(row.password_encrypted) : '';
    const privateKey = row.private_key_encrypted ? decrypt(row.private_key_encrypted) : '';

    if (protocol === 'ftp') {
      const client = new ftp.Client();
      client.ftp.verbose = false;
      try {
        await client.access({
          host: row.host.trim(),
          port: parseInt(row.port, 10) || 21,
          user: row.username.trim(),
          password,
          secure: false,
        });

        const initialPath = row.current_path || row.initial_path || '/';
        try {
          if (initialPath && initialPath !== '/') {
            await client.cd(initialPath);
          }
        } catch (e) {}

        session = {
          sessionId,
          userId,
          protocol: 'ftp',
          client,
          info: {
            host: row.host,
            port: row.port,
            username: row.username,
            protocol: 'ftp',
            name: `${row.username}@${row.host}`,
            connectedAt: row.last_used_at,
            initialPath: row.initial_path,
          },
          currentPath: initialPath,
          lastUsed: Date.now(),
          timeoutTimer: null,
        };

        sessions.set(sessionId, session);
        this.resetSessionTimeout(sessionId);
        return session;
      } catch (err) {
        try { await db.run('DELETE FROM active_sessions WHERE session_id = ?', [sessionId]); } catch (e) {}
        throw new Error(`Failed to reconnect to FTP: ${err.message}`);
      }
    } else {
      // SFTP
      const client = new SftpClient();
      const connectOptions = {
        host: row.host.trim(),
        port: parseInt(row.port, 10) || 22,
        username: row.username.trim(),
        readyTimeout: 15000,
        keepaliveInterval: 15000,
      };

      if (privateKey) connectOptions.privateKey = privateKey;
      else if (password) connectOptions.password = password;

      try {
        await client.connect(connectOptions);
        session = {
          sessionId,
          userId,
          protocol: 'sftp',
          client,
          info: {
            host: row.host,
            port: row.port,
            username: row.username,
            protocol: 'sftp',
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
        try { await db.run('DELETE FROM active_sessions WHERE session_id = ?', [sessionId]); } catch (e) {}
        throw new Error(`Failed to reconnect to SFTP: ${err.message}`);
      }
    }
  }

  static async runWithLock(sessionId, userId, fn) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const prevLock = sessionLocks.get(sessionId) || Promise.resolve();
    let release;
    const currentLock = new Promise((resolve) => {
      release = resolve;
    });
    const tail = prevLock.then(() => currentLock, () => currentLock);
    sessionLocks.set(sessionId, tail);

    await prevLock.catch(() => {});

    try {
      let session = await this.getSession(sessionId, userId);

      try {
        return await fn(session);
      } catch (err) {
        const errMsg = (err && err.message) || '';
        const isFtpBroken = session.protocol === 'ftp' && (
          session.client.closed ||
          errMsg.includes('Client is closed') ||
          errMsg.includes('another one is still running') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('Timeout') ||
          errMsg.includes('unexpected close')
        );

        if (isFtpBroken) {
          console.warn(`[SFTPManager] Reconnecting FTP after socket issue (${errMsg})...`);
          try { session.client.close(); } catch (e) {}
          sessions.delete(sessionId);
          session = await this.getSession(sessionId, userId);
          return await fn(session);
        }

        throw err;
      }
    } finally {
      release();
      if (sessionLocks.get(sessionId) === tail) {
        sessionLocks.delete(sessionId);
      }
    }
  }

  static resetSessionTimeout(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    session.timeoutTimer = setTimeout(async () => {
      console.log(`[Session] ${sessionId} timed out.`);
      await this.disconnect(sessionId);
    }, config.sessionTimeoutMs);
  }

  static async testConnection({ host, port, username, password, privateKey, protocol: explicitProtocol }) {
    const protocol = this.detectProtocol(port, explicitProtocol);
    const startTime = Date.now();

    if (protocol === 'ftp') {
      const client = new ftp.Client();
      client.ftp.verbose = false;
      try {
        await client.access({
          host: host.trim(),
          port: parseInt(port, 10) || 21,
          user: username.trim(),
          password: password || '',
          secure: false,
        });

        const latencyMs = Date.now() - startTime;
        let workingDir = '/';
        try {
          workingDir = await client.pwd();
        } catch (e) {}
        client.close();

        return {
          success: true,
          protocol: 'ftp',
          latencyMs,
          workingDir: workingDir || '/',
          message: 'Connected successfully to FTP server',
        };
      } catch (err) {
        try { client.close(); } catch (e) {}
        return {
          success: false,
          protocol: 'ftp',
          error: err.message || 'FTP Connection failed',
        };
      }
    } else {
      // SFTP
      const client = new SftpClient();
      try {
        const connectOptions = {
          host: host.trim(),
          port: parseInt(port, 10) || 22,
          username: username.trim(),
          readyTimeout: 12000,
          keepaliveInterval: 10000,
        };

        if (privateKey) connectOptions.privateKey = privateKey;
        else if (password) connectOptions.password = password;

        await client.connect(connectOptions);
        const latencyMs = Date.now() - startTime;
        const cwd = await client.cwd();
        await client.end();

        return {
          success: true,
          protocol: 'sftp',
          latencyMs,
          workingDir: cwd || '/',
          message: 'Connected successfully to SFTP server',
        };
      } catch (err) {
        try { await client.end(); } catch (e) {}
        return {
          success: false,
          protocol: 'sftp',
          error: err.message || 'SFTP Connection failed',
        };
      }
    }
  }

  static async createSession(userId, connectionConfig) {
    const sessionId = crypto.randomUUID();
    const port = parseInt(connectionConfig.port, 10) || (connectionConfig.protocol === 'ftp' ? 21 : 22);
    const protocol = this.detectProtocol(port, connectionConfig.protocol);

    if (protocol === 'ftp') {
      const client = new ftp.Client();
      client.ftp.verbose = false;

      try {
        await client.access({
          host: connectionConfig.host.trim(),
          port,
          user: connectionConfig.username.trim(),
          password: connectionConfig.password || '',
          secure: false,
        });

        let initialPath = connectionConfig.defaultPath || '/';
        try {
          const pwd = await client.pwd();
          if (pwd && (!initialPath || initialPath === '/')) {
            initialPath = pwd;
          }
        } catch (e) {
          initialPath = '/';
        }

        const sessionData = {
          sessionId,
          userId,
          protocol: 'ftp',
          client,
          info: {
            host: connectionConfig.host,
            port,
            username: connectionConfig.username,
            protocol: 'ftp',
            name: connectionConfig.name || `${connectionConfig.username}@${connectionConfig.host}`,
            connectedAt: new Date().toISOString(),
            initialPath,
          },
          currentPath: initialPath,
          lastUsed: Date.now(),
          timeoutTimer: null,
        };

        sessions.set(sessionId, sessionData);
        this.resetSessionTimeout(sessionId);

        // Save session in database for serverless persistence
        try {
          const encPass = connectionConfig.password ? encrypt(connectionConfig.password) : null;
          await db.run(
            `INSERT OR REPLACE INTO active_sessions (session_id, user_id, host, port, username, password_encrypted, private_key_encrypted, initial_path, current_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, userId, connectionConfig.host, port, connectionConfig.username, encPass, null, initialPath, initialPath]
          );
        } catch (dbErr) {}

        return {
          sessionId,
          info: sessionData.info,
        };
      } catch (err) {
        try { client.close(); } catch (e) {}
        throw new Error(`FTP Connection failed: ${err.message}`);
      }
    } else {
      // SFTP
      const client = new SftpClient();
      const connectOptions = {
        host: connectionConfig.host.trim(),
        port,
        username: connectionConfig.username.trim(),
        readyTimeout: 15000,
        keepaliveInterval: 15000,
      };

      if (connectionConfig.privateKey) connectOptions.privateKey = connectionConfig.privateKey;
      else if (connectionConfig.password) connectOptions.password = connectionConfig.password;

      try {
        await client.connect(connectOptions);
        let initialPath = connectionConfig.defaultPath || '/';
        try {
          const cwd = await client.cwd();
          if (cwd && (!initialPath || initialPath === '/')) initialPath = cwd;
        } catch (e) {
          initialPath = '/';
        }

        const sessionData = {
          sessionId,
          userId,
          protocol: 'sftp',
          client,
          info: {
            host: connectionConfig.host,
            port,
            username: connectionConfig.username,
            protocol: 'sftp',
            name: connectionConfig.name || `${connectionConfig.username}@${connectionConfig.host}`,
            connectedAt: new Date().toISOString(),
            initialPath,
          },
          currentPath: initialPath,
          lastUsed: Date.now(),
          timeoutTimer: null,
        };

        sessions.set(sessionId, sessionData);
        this.resetSessionTimeout(sessionId);

        try {
          const encPass = connectionConfig.password ? encrypt(connectionConfig.password) : null;
          const encKey = connectionConfig.privateKey ? encrypt(connectionConfig.privateKey) : null;
          await db.run(
            `INSERT OR REPLACE INTO active_sessions (session_id, user_id, host, port, username, password_encrypted, private_key_encrypted, initial_path, current_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, userId, connectionConfig.host, port, connectionConfig.username, encPass, encKey, initialPath, initialPath]
          );
        } catch (dbErr) {}

        return {
          sessionId,
          info: sessionData.info,
        };
      } catch (err) {
        try { await client.end(); } catch (e) {}
        throw new Error(`SFTP Connection failed: ${err.message}`);
      }
    }
  }

  static async disconnect(sessionId, userId = null) {
    sessionLocks.delete(sessionId);
    const session = sessions.get(sessionId);
    if (session && userId && session.userId !== userId) {
      throw new Error('Unauthorized access.');
    }

    if (session) {
      if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
      try {
        if (session.protocol === 'ftp') {
          session.client.close();
        } else {
          await session.client.end();
        }
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
    return this.runWithLock(sessionId, userId, async (session) => {
      const targetPath = this.formatPath(remotePath || session.currentPath || '/');

      if (session.protocol === 'ftp') {
        try {
          await session.client.cd(targetPath);
          const rawList = await session.client.list();
          session.currentPath = targetPath;

          try {
            await db.run('UPDATE active_sessions SET current_path = ?, last_used_at = CURRENT_TIMESTAMP WHERE session_id = ?', [targetPath, sessionId]);
          } catch (e) {}

          const items = rawList.map((item) => {
            const isDir = item.isDirectory;
            const isSymlink = item.isSymbolicLink;
            return {
              name: item.name,
              type: isDir ? 'd' : (isSymlink ? 'l' : '-'),
              isDirectory: isDir,
              isSymlink,
              size: item.size || 0,
              modifyTime: item.rawModifiedAt ? new Date(item.rawModifiedAt).getTime() : Date.now(),
              permissions: item.permissions ? `${item.permissions.user || 'rw'}${item.permissions.group || 'r'}${item.permissions.world || 'r'}` : 'rwxrwxr-x',
            };
          });

          items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });

          return { path: targetPath, items };
        } catch (err) {
          throw new Error(`Failed to list directory '${targetPath}': ${err.message}`);
        }
      } else {
        // SFTP
        try {
          const rawList = await session.client.list(targetPath);
          session.currentPath = targetPath;

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

          return { path: targetPath, items };
        } catch (err) {
          throw new Error(`Failed to list directory '${targetPath}': ${err.message}`);
        }
      }
    });
  }

  static formatRights(rights) {
    if (!rights) return 'rw-r--r--';
    const u = rights.user || 'rw-';
    const g = rights.group || 'r--';
    const o = rights.other || 'r--';
    return `${u}${g}${o}`;
  }

  static async readFile(sessionId, userId, remoteFilePath) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remoteFilePath);

      if (session.protocol === 'ftp') {
        try {
          const chunks = [];
          const writable = new Writable({
            write(chunk, enc, cb) {
              chunks.push(chunk);
              cb();
            },
          });
          await session.client.downloadTo(writable, formatted);
          const buffer = Buffer.concat(chunks);
          return {
            path: formatted,
            content: buffer.toString('utf8'),
            size: buffer.length,
          };
        } catch (err) {
          throw new Error(`Failed to read file '${formatted}': ${err.message}`);
        }
      } else {
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
    });
  }

  static async writeFile(sessionId, userId, remoteFilePath, content) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remoteFilePath);
      const buffer = Buffer.from(content, 'utf8');

      if (session.protocol === 'ftp') {
        try {
          const readable = Readable.from(buffer);
          await session.client.uploadFrom(readable, formatted);
          return { success: true, path: formatted, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to write file '${formatted}': ${err.message}`);
        }
      } else {
        try {
          await session.client.put(buffer, formatted);
          return { success: true, path: formatted, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to write file '${formatted}': ${err.message}`);
        }
      }
    });
  }

  static async downloadFile(sessionId, userId, remoteFilePath) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remoteFilePath);
      const filename = path.posix.basename(formatted);

      if (session.protocol === 'ftp') {
        try {
          const chunks = [];
          const writable = new Writable({
            write(chunk, enc, cb) {
              chunks.push(chunk);
              cb();
            },
          });
          await session.client.downloadTo(writable, formatted);
          const buffer = Buffer.concat(chunks);
          return { buffer, filename, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to download file '${formatted}': ${err.message}`);
        }
      } else {
        try {
          const buffer = await session.client.get(formatted);
          return { buffer, filename, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to download file '${formatted}': ${err.message}`);
        }
      }
    });
  }

  static async uploadFile(sessionId, userId, localFilePath, remoteDirPath, originalFilename) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const dir = this.formatPath(remoteDirPath);
      const remoteDest = path.posix.join(dir, originalFilename);

      if (session.protocol === 'ftp') {
        try {
          try { await session.client.ensureDir(dir); } catch (e) {}
          await session.client.uploadFrom(localFilePath, remoteDest);
          return { success: true, path: remoteDest, name: originalFilename };
        } catch (err) {
          throw new Error(`Failed to upload to '${remoteDest}': ${err.message}`);
        }
      } else {
        try {
          try { await session.client.mkdir(dir, true); } catch (e) {}
          await session.client.fastPut(localFilePath, remoteDest);
          return { success: true, path: remoteDest, name: originalFilename };
        } catch (err) {
          try {
            const fileData = fs.readFileSync(localFilePath);
            await session.client.put(fileData, remoteDest);
            return { success: true, path: remoteDest, name: originalFilename };
          } catch (innerErr) {
            throw new Error(`Failed to upload to '${remoteDest}': ${innerErr.message}`);
          }
        }
      }
    });
  }

  static async uploadBuffer(sessionId, userId, buffer, remoteDirPath, originalFilename) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const dir = this.formatPath(remoteDirPath);
      const remoteDest = path.posix.join(dir, originalFilename);

      if (session.protocol === 'ftp') {
        try {
          try { await session.client.ensureDir(dir); } catch (e) {}
          const readable = Readable.from(buffer);
          await session.client.uploadFrom(readable, remoteDest);
          return { success: true, path: remoteDest, name: originalFilename, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to upload to '${remoteDest}': ${err.message}`);
        }
      } else {
        try {
          try { await session.client.mkdir(dir, true); } catch (e) {}
          await session.client.put(buffer, remoteDest);
          return { success: true, path: remoteDest, name: originalFilename, size: buffer.length };
        } catch (err) {
          throw new Error(`Failed to upload to '${remoteDest}': ${err.message}`);
        }
      }
    });
  }

  static async mkdir(sessionId, userId, remoteDirPath) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remoteDirPath);

      if (session.protocol === 'ftp') {
        try {
          await session.client.ensureDir(formatted);
          return { success: true, path: formatted };
        } catch (err) {
          throw new Error(`Failed to create directory '${formatted}': ${err.message}`);
        }
      } else {
        try {
          await session.client.mkdir(formatted, true);
          return { success: true, path: formatted };
        } catch (err) {
          throw new Error(`Failed to create directory '${formatted}': ${err.message}`);
        }
      }
    });
  }

  static async createFile(sessionId, userId, remoteFilePath) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remoteFilePath);

      if (session.protocol === 'ftp') {
        try {
          const readable = Readable.from(Buffer.from(''));
          await session.client.uploadFrom(readable, formatted);
          return { success: true, path: formatted };
        } catch (err) {
          throw new Error(`Failed to create file '${formatted}': ${err.message}`);
        }
      } else {
        try {
          await session.client.put(Buffer.from(''), formatted);
          return { success: true, path: formatted };
        } catch (err) {
          throw new Error(`Failed to create empty file '${formatted}': ${err.message}`);
        }
      }
    });
  }

  static async rename(sessionId, userId, oldPath, newPath) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const fromPath = this.formatPath(oldPath);
      const toPath = this.formatPath(newPath);

      try {
        await session.client.rename(fromPath, toPath);
        return { success: true, oldPath: fromPath, newPath: toPath };
      } catch (err) {
        throw new Error(`Failed to rename '${fromPath}' to '${toPath}': ${err.message}`);
      }
    });
  }

  static async chmod(sessionId, userId, remotePath, mode) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remotePath);

      if (session.protocol === 'ftp') {
        try {
          await session.client.send(`SITE CHMOD ${mode} ${formatted}`);
          return { success: true, path: formatted, mode };
        } catch (err) {
          return { success: true, path: formatted, mode, note: 'CHMOD command sent' };
        }
      } else {
        try {
          const octalMode = parseInt(mode, 8);
          await session.client.chmod(formatted, octalMode);
          return { success: true, path: formatted, mode };
        } catch (err) {
          throw new Error(`Failed to chmod '${formatted}' to ${mode}: ${err.message}`);
        }
      }
    });
  }

  static async delete(sessionId, userId, remotePath, isDirectory = false) {
    return this.runWithLock(sessionId, userId, async (session) => {
      const formatted = this.formatPath(remotePath);

      if (session.protocol === 'ftp') {
        try {
          if (isDirectory) {
            await session.client.removeDir(formatted);
          } else {
            await session.client.remove(formatted);
          }
          return { success: true, path: formatted };
        } catch (err) {
          try {
            if (!isDirectory) {
              await session.client.removeDir(formatted);
              return { success: true, path: formatted };
            }
          } catch (e) {}
          throw new Error(`Failed to delete '${formatted}': ${err.message}`);
        }
      } else {
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
    });
  }

  static async getActiveSession(sessionId, userId) {
    try {
      const session = await this.getSession(sessionId, userId);
      return {
        sessionId: session.sessionId,
        protocol: session.protocol,
        info: session.info,
        currentPath: session.currentPath,
        connectedAt: session.info.connectedAt,
      };
    } catch (e) {
      return null;
    }
  }
}
