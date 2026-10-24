import Client from 'ssh2-sftp-client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Map of active SFTP sessions: sessionId -> { client, info, lastUsed, timeoutTimer }
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

  static getSession(sessionId, userId) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('SFTP session not found or expired. Please reconnect.');
    }
    if (session.userId !== userId) {
      throw new Error('Unauthorized access to session.');
    }
    // Update last used timestamp
    session.lastUsed = Date.now();
    this.resetSessionTimeout(sessionId);
    return session;
  }

  static resetSessionTimeout(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    session.timeoutTimer = setTimeout(async () => {
      console.log(`[SFTP] Session ${sessionId} timed out due to inactivity.`);
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
    if (!session) return { message: 'Already disconnected' };

    if (userId && session.userId !== userId) {
      throw new Error('Unauthorized access.');
    }

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    try {
      await session.client.end();
    } catch (err) {
      console.warn(`[SFTP] Error closing client: ${err.message}`);
    } finally {
      sessions.delete(sessionId);
    }

    return { message: 'Disconnected successfully' };
  }

  static async list(sessionId, userId, remotePath = null) {
    const session = this.getSession(sessionId, userId);
    const targetPath = this.formatPath(remotePath || session.currentPath || '/');

    try {
      const rawList = await session.client.list(targetPath);
      session.currentPath = targetPath;

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

      // Sort: folders first, then files alphabetically
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
    const session = this.getSession(sessionId, userId);
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
    const session = this.getSession(sessionId, userId);
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
    const session = this.getSession(sessionId, userId);
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
    const session = this.getSession(sessionId, userId);
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
      // Fallback to standard put if fastPut fails
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
    const session = this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteDirPath);

    try {
      await session.client.mkdir(formatted, true);
      return { success: true, path: formatted };
    } catch (err) {
      throw new Error(`Failed to create directory '${formatted}': ${err.message}`);
    }
  }

  static async createFile(sessionId, userId, remoteFilePath) {
    const session = this.getSession(sessionId, userId);
    const formatted = this.formatPath(remoteFilePath);

    try {
      await session.client.put(Buffer.from(''), formatted);
      return { success: true, path: formatted };
    } catch (err) {
      throw new Error(`Failed to create empty file '${formatted}': ${err.message}`);
    }
  }

  static async rename(sessionId, userId, oldPath, newPath) {
    const session = this.getSession(sessionId, userId);
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
    const session = this.getSession(sessionId, userId);
    const formatted = this.formatPath(remotePath);

    try {
      // mode can be octal string e.g. '755' or '0755'
      const octalMode = parseInt(mode, 8);
      await session.client.chmod(formatted, octalMode);
      return { success: true, path: formatted, mode };
    } catch (err) {
      throw new Error(`Failed to chmod '${formatted}' to ${mode}: ${err.message}`);
    }
  }

  static async delete(sessionId, userId, remotePath, isDirectory = false) {
    const session = this.getSession(sessionId, userId);
    const formatted = this.formatPath(remotePath);

    try {
      if (isDirectory) {
        await session.client.rmdir(formatted, true);
      } else {
        await session.client.delete(formatted);
      }
      return { success: true, path: formatted };
    } catch (err) {
      // In case directory flag wasn't known beforehand
      try {
        if (!isDirectory) {
          await session.client.rmdir(formatted, true);
          return { success: true, path: formatted };
        }
      } catch (e) {}
      throw new Error(`Failed to delete '${formatted}': ${err.message}`);
    }
  }

  static getActiveSession(sessionId, userId) {
    const session = sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return null;
    }
    return {
      sessionId: session.sessionId,
      info: session.info,
      currentPath: session.currentPath,
      connectedAt: session.info.connectedAt,
    };
  }
}
