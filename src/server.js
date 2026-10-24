import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { db } from './db.js';
import { hashPassword, verifyPassword, generateToken, authMiddleware } from './auth.js';
import { encrypt, decrypt } from './crypto.js';
import { SFTPManager } from './sftp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadsDir = path.join(rootDir, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(rootDir, 'public')));

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = db.get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const passwordHash = await hashPassword(password);
    db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username.trim(), (email || '').trim(), passwordHash]
    );

    const newUser = db.get('SELECT id, username, email, created_at FROM users WHERE username = ?', [username.trim()]);
    const token = generateToken(newUser);

    return res.status(201).json({
      message: 'Account created successfully',
      user: newUser,
      token,
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = generateToken(user);
    return res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to authenticate.' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

app.get('/api/config/defaults', (req, res) => {
  return res.json({
    defaultHost: config.defaultSftpHost || '',
    defaultPort: config.defaultSftpPort || 22,
    defaultUsername: config.defaultSftpUsername || '',
  });
});

// --- SAVED CONNECTIONS ROUTES ---
app.get('/api/connections', authMiddleware, (req, res) => {
  try {
    const rows = db.query(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, last_connected_at, created_at, updated_at
       FROM connections WHERE user_id = ? ORDER BY id DESC`,
      [req.user.id]
    );
    return res.json({ connections: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/connections', authMiddleware, async (req, res) => {
  try {
    const { name, host, port, username, password, auth_type, private_key, default_path } = req.body;
    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required.' });
    }

    const portNum = parseInt(port, 10) || 22;
    const authType = auth_type || 'password';
    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedKey = private_key ? encrypt(private_key) : null;
    const defPath = default_path && default_path.trim() ? default_path.trim() : '/';

    db.run(
      `INSERT INTO connections (user_id, name, host, port, username, password_encrypted, auth_type, private_key_encrypted, default_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name.trim(), host.trim(), portNum, username.trim(), encryptedPassword, authType, encryptedKey, defPath]
    );

    const created = db.get(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, created_at
       FROM connections WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );

    return res.status(201).json({
      message: 'Connection profile saved successfully',
      connection: created,
    });
  } catch (err) {
    console.error('Save connection error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/connections/:id', authMiddleware, async (req, res) => {
  try {
    const connId = parseInt(req.params.id, 10);
    const existing = db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connId, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Connection not found.' });
    }

    const { name, host, port, username, password, auth_type, private_key, default_path } = req.body;
    const portNum = parseInt(port, 10) || existing.port;
    const authType = auth_type || existing.auth_type;
    const defPath = default_path !== undefined ? default_path : existing.default_path;

    let encPass = existing.password_encrypted;
    if (password !== undefined && password !== '') {
      encPass = encrypt(password);
    }

    let encKey = existing.private_key_encrypted;
    if (private_key !== undefined && private_key !== '') {
      encKey = encrypt(private_key);
    }

    db.run(
      `UPDATE connections
       SET name = ?, host = ?, port = ?, username = ?, password_encrypted = ?, auth_type = ?, private_key_encrypted = ?, default_path = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        (name || existing.name).trim(),
        (host || existing.host).trim(),
        portNum,
        (username || existing.username).trim(),
        encPass,
        authType,
        encKey,
        defPath,
        connId,
        req.user.id,
      ]
    );

    const updated = db.get(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, updated_at
       FROM connections WHERE id = ? AND user_id = ?`,
      [connId, req.user.id]
    );

    return res.json({ message: 'Connection updated', connection: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/connections/:id', authMiddleware, (req, res) => {
  try {
    const connId = parseInt(req.params.id, 10);
    db.run('DELETE FROM connections WHERE id = ? AND user_id = ?', [connId, req.user.id]);
    return res.json({ message: 'Connection removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/connections/test', authMiddleware, async (req, res) => {
  try {
    let { host, port, username, password, private_key, connectionId } = req.body;

    if (connectionId) {
      const conn = db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connectionId, req.user.id]);
      if (!conn) return res.status(404).json({ error: 'Connection profile not found' });
      host = conn.host;
      port = conn.port;
      username = conn.username;
      password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
      private_key = conn.private_key_encrypted ? decrypt(conn.private_key_encrypted) : '';
    }

    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required for connection test.' });
    }

    const result = await SFTPManager.testConnection({
      host,
      port: port || 22,
      username,
      password,
      privateKey: private_key,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- SFTP SESSION & FILE MANAGEMENT ROUTES ---
app.post('/api/sftp/connect', authMiddleware, async (req, res) => {
  try {
    let { connectionId, host, port, username, password, private_key, default_path, saveConnection, name } = req.body;

    let connectionConfig = null;

    if (connectionId) {
      const conn = db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connectionId, req.user.id]);
      if (!conn) {
        return res.status(404).json({ error: 'Saved connection not found.' });
      }

      const decryptedPassword = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
      const decryptedKey = conn.private_key_encrypted ? decrypt(conn.private_key_encrypted) : '';

      connectionConfig = {
        name: conn.name,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: decryptedPassword,
        privateKey: decryptedKey,
        defaultPath: conn.default_path,
      };

      // Update last connected timestamp
      db.run('UPDATE connections SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?', [conn.id]);
    } else {
      if (!host || !username) {
        return res.status(400).json({ error: 'Host and username are required.' });
      }

      connectionConfig = {
        name: name || host,
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        password: password || '',
        privateKey: private_key || '',
        defaultPath: default_path || '/',
      };

      // Optional: auto-save connection profile if user checked the box
      if (saveConnection) {
        try {
          const encPass = password ? encrypt(password) : null;
          const encKey = private_key ? encrypt(private_key) : null;
          db.run(
            `INSERT INTO connections (user_id, name, host, port, username, password_encrypted, auth_type, private_key_encrypted, default_path, last_connected_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [req.user.id, (name || host).trim(), host.trim(), connectionConfig.port, username.trim(), encPass, 'password', encKey, connectionConfig.defaultPath]
          );
        } catch (e) {
          console.warn('Could not auto-save connection:', e.message);
        }
      }
    }

    const session = await SFTPManager.createSession(req.user.id, connectionConfig);
    return res.json({
      message: 'Connected to SFTP server successfully',
      sessionId: session.sessionId,
      info: session.info,
    });
  } catch (err) {
    console.error('SFTP connection error:', err);
    return res.status(500).json({ error: err.message || 'Failed to connect to SFTP' });
  }
});

app.get('/api/sftp/status', authMiddleware, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.json({ connected: false });
  }
  const session = SFTPManager.getActiveSession(sessionId, req.user.id);
  if (!session) {
    return res.json({ connected: false });
  }
  return res.json({ connected: true, session });
});

app.post('/api/sftp/disconnect', authMiddleware, async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.json({ message: 'No active session' });
  }
  const result = await SFTPManager.disconnect(sessionId, req.user.id);
  return res.json(result);
});

app.get('/api/sftp/list', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const remotePath = req.query.path || null;
    const data = await SFTPManager.list(sessionId, req.user.id, remotePath);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sftp/read', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required.' });
    }
    const data = await SFTPManager.readFile(sessionId, req.user.id, filePath);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/write', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Path and content are required.' });
    }
    const data = await SFTPManager.writeFile(sessionId, req.user.id, filePath, content);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sftp/download', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required.' });
    }
    const data = await SFTPManager.downloadFile(sessionId, req.user.id, filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', data.size);
    return res.send(data.buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/upload', authMiddleware, upload.single('file'), async (req, res) => {
  let tempFilePath = null;
  try {
    const sessionId = req.headers['x-session-id'];
    const remoteDir = req.body.remoteDir || '/';

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    tempFilePath = req.file.path;
    const originalName = req.file.originalname;

    const result = await SFTPManager.uploadFile(
      sessionId,
      req.user.id,
      tempFilePath,
      remoteDir,
      originalName
    );

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
});

app.post('/api/sftp/mkdir', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required.' });
    }
    const result = await SFTPManager.mkdir(sessionId, req.user.id, dirPath);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/create-file', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required.' });
    }
    const result = await SFTPManager.createFile(sessionId, req.user.id, filePath);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/rename', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Old path and new path are required.' });
    }
    const result = await SFTPManager.rename(sessionId, req.user.id, oldPath, newPath);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/chmod', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { path: targetPath, mode } = req.body;
    if (!targetPath || !mode) {
      return res.status(400).json({ error: 'Path and permission mode are required.' });
    }
    const result = await SFTPManager.chmod(sessionId, req.user.id, targetPath, mode);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sftp/delete', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { path: targetPath, isDirectory } = req.body;
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required.' });
    }
    const result = await SFTPManager.delete(sessionId, req.user.id, targetPath, isDirectory);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// Start Server
app.listen(config.port, () => {
  console.log(`===============================================`);
  console.log(`🚀 AKM SFTP Manager is running on:`);
  console.log(`   http://localhost:${config.port}`);
  console.log(`===============================================`);
});
