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
const uploadsDir = config.isVercel ? '/tmp/uploads' : path.join(rootDir, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {}
}

const upload = multer({ dest: uploadsDir });
export const app = express();

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

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const passwordHash = await hashPassword(password);
    await db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username.trim(), (email || '').trim(), passwordHash]
    );

    const newUser = await db.get('SELECT id, username, email, created_at FROM users WHERE username = ?', [username.trim()]);
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

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
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
    databaseType: db.getType(),
  });
});

// --- SAVED CONNECTIONS ROUTES ---
app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, plugins_path, last_connected_at, created_at, updated_at
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
    const { name, host, port, username, password, auth_type, private_key, default_path, plugins_path } = req.body;
    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required.' });
    }

    const portNum = parseInt(port, 10) || 22;
    const authType = auth_type || 'password';
    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedKey = private_key ? encrypt(private_key) : null;
    const defPath = default_path && default_path.trim() ? default_path.trim() : '/';
    const plugPath = plugins_path && plugins_path.trim() ? plugins_path.trim() : '/plugins';

    await db.run(
      `INSERT INTO connections (user_id, name, host, port, username, password_encrypted, auth_type, private_key_encrypted, default_path, plugins_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name.trim(), host.trim(), portNum, username.trim(), encryptedPassword, authType, encryptedKey, defPath, plugPath]
    );

    const created = await db.get(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, plugins_path, created_at
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
    const existing = await db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connId, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Connection not found.' });
    }

    const { name, host, port, username, password, auth_type, private_key, default_path, plugins_path } = req.body;
    const portNum = parseInt(port, 10) || existing.port;
    const authType = auth_type || existing.auth_type;
    const defPath = default_path !== undefined ? default_path : existing.default_path;
    const plugPath = plugins_path !== undefined ? plugins_path : (existing.plugins_path || '/plugins');

    let encPass = existing.password_encrypted;
    if (password !== undefined && password !== '') {
      encPass = encrypt(password);
    }

    let encKey = existing.private_key_encrypted;
    if (private_key !== undefined && private_key !== '') {
      encKey = encrypt(private_key);
    }

    await db.run(
      `UPDATE connections
       SET name = ?, host = ?, port = ?, username = ?, password_encrypted = ?, auth_type = ?, private_key_encrypted = ?, default_path = ?, plugins_path = ?, updated_at = CURRENT_TIMESTAMP
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
        plugPath,
        connId,
        req.user.id,
      ]
    );

    const updated = await db.get(
      `SELECT id, user_id, name, host, port, username, auth_type, default_path, plugins_path, updated_at
       FROM connections WHERE id = ? AND user_id = ?`,
      [connId, req.user.id]
    );

    return res.json({ message: 'Connection updated', connection: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/connections/:id', authMiddleware, async (req, res) => {
  try {
    const connId = parseInt(req.params.id, 10);
    await db.run('DELETE FROM connections WHERE id = ? AND user_id = ?', [connId, req.user.id]);
    return res.json({ message: 'Connection removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/connections/test', authMiddleware, async (req, res) => {
  try {
    let { host, port, username, password, private_key, connectionId, protocol } = req.body;

    if (connectionId) {
      const conn = await db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connectionId, req.user.id]);
      if (!conn) return res.status(404).json({ error: 'Connection profile not found' });
      host = conn.host;
      port = conn.port;
      username = conn.username;
      if (!password && conn.password_encrypted) {
        try {
          password = decrypt(conn.password_encrypted);
        } catch (decErr) {
          return res.status(400).json({
            success: false,
            error: 'Stored password could not be decrypted. Please click Edit on this connection, enter your password, and click Save.',
          });
        }
      }
      if (!private_key && conn.private_key_encrypted) {
        try {
          private_key = decrypt(conn.private_key_encrypted);
        } catch (e) {}
      }
      if (!protocol) protocol = conn.auth_type;
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
      protocol,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- SFTP / FTP SESSION & FILE MANAGEMENT ROUTES ---
app.post('/api/sftp/connect', authMiddleware, async (req, res) => {
  try {
    let { connectionId, host, port, username, password, private_key, default_path, plugins_path, saveConnection, name, protocol } = req.body;

    let connectionConfig = null;

    if (connectionId) {
      const conn = await db.get('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connectionId, req.user.id]);
      if (!conn) {
        return res.status(404).json({ error: 'Saved connection not found.' });
      }

      let decryptedPassword = '';
      if (password) {
        decryptedPassword = password;
        // Auto-update encrypted password with current master key
        try {
          await db.run('UPDATE connections SET password_encrypted = ? WHERE id = ?', [encrypt(password), conn.id]);
        } catch (e) {}
      } else if (conn.password_encrypted) {
        try {
          decryptedPassword = decrypt(conn.password_encrypted);
        } catch (decErr) {
          return res.status(400).json({
            error: 'Stored password could not be decrypted. Please click Edit on this connection, enter your password, and click Save.',
          });
        }
      }

      let decryptedKey = '';
      if (private_key) {
        decryptedKey = private_key;
      } else if (conn.private_key_encrypted) {
        try {
          decryptedKey = decrypt(conn.private_key_encrypted);
        } catch (e) {}
      }

      connectionConfig = {
        name: conn.name,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: decryptedPassword,
        privateKey: decryptedKey,
        defaultPath: conn.default_path,
        pluginsPath: conn.plugins_path || '/plugins',
        protocol: conn.auth_type === 'ftp' || conn.port === 21 ? 'ftp' : 'sftp',
      };

      await db.run('UPDATE connections SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?', [conn.id]);
    } else {
      if (!host || !username) {
        return res.status(400).json({ error: 'Host and username are required.' });
      }

      const portNum = parseInt(port, 10) || (protocol === 'ftp' ? 21 : 22);
      const proto = protocol || (portNum === 21 ? 'ftp' : 'sftp');

      connectionConfig = {
        name: name || host,
        host: host.trim(),
        port: portNum,
        username: username.trim(),
        password: password || '',
        privateKey: private_key || '',
        defaultPath: default_path || '/',
        pluginsPath: plugins_path || '/plugins',
        protocol: proto,
      };

      if (saveConnection) {
        try {
          const encPass = password ? encrypt(password) : null;
          const encKey = private_key ? encrypt(private_key) : null;
          await db.run(
            `INSERT INTO connections (user_id, name, host, port, username, password_encrypted, auth_type, private_key_encrypted, default_path, plugins_path, last_connected_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [req.user.id, (name || host).trim(), host.trim(), connectionConfig.port, username.trim(), encPass, proto, encKey, connectionConfig.defaultPath, connectionConfig.pluginsPath]
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
      info: {
        ...session.info,
        pluginsPath: connectionConfig.pluginsPath || '/plugins',
      },
    });
  } catch (err) {
    console.error('SFTP connection error:', err);
    return res.status(500).json({ error: err.message || 'Failed to connect to SFTP' });
  }
});

app.get('/api/sftp/status', authMiddleware, async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.json({ connected: false });
  }
  const session = await SFTPManager.getActiveSession(sessionId, req.user.id);
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

// --- MINECRAFT PLUGIN MANAGER ENDPOINTS ---

const POPULAR_PLUGINS = [
  {
    id: 'essentialsx',
    name: 'EssentialsX',
    description: 'The essential plugin suite for Spigot and Paper servers (economy, teleportation, warps, homes, messaging).',
    author: 'mdcfe',
    source: 'modrinth',
    slug: 'essentialsx',
    downloads: 940000,
    iconUrl: 'https://cdn.modrinth.com/data/hXiIvTyT/e621675be1d0421b43b65ab8082507532d937009_96.webp',
    tag: 'Essential'
  },
  {
    id: 'luckperms',
    name: 'LuckPerms',
    description: 'An advanced permissions plugin for Minecraft servers (Spigot, Paper, BungeeCord, Velocity).',
    author: 'Luck',
    source: 'modrinth',
    slug: 'luckperms',
    downloads: 1250000,
    iconUrl: 'https://cdn.modrinth.com/data/Vebnzrzj/7d12ec428514101e976db57f20e409ec8ec7952a_96.webp',
    tag: 'Permissions'
  },
  {
    id: 'worldedit',
    name: 'WorldEdit',
    description: 'In-game Minecraft map editor and terraforming tool for creative building and server administration.',
    author: 'EngineHub',
    source: 'modrinth',
    slug: 'worldedit',
    downloads: 2500000,
    iconUrl: 'https://cdn.modrinth.com/data/1eAoo2Vp/0268ec3ba0ebcbe53cf34b462c0352ffb6140889_96.webp',
    tag: 'Building'
  },
  {
    id: 'vault',
    name: 'Vault',
    description: 'Universal Economy, Permissions, and Chat API bridge required by hundreds of Minecraft plugins.',
    author: 'Sleaker',
    source: 'modrinth',
    slug: 'vault',
    downloads: 780000,
    iconUrl: 'https://cdn.modrinth.com/data/Hj4Fq0Yj/8ea0199e19d71c12140a7cf3d3b6f2fb7c413bca_96.webp',
    tag: 'Economy'
  },
  {
    id: 'viaversion',
    name: 'ViaVersion',
    description: 'Allows newer Minecraft client versions to connect to older server versions seamlessly.',
    author: 'FormallyGerry',
    source: 'modrinth',
    slug: 'viaversion',
    downloads: 1500000,
    iconUrl: 'https://cdn.modrinth.com/data/P1OZGk5p/6aae745ec777ae6dc1bbcfbcf42ec162c8e2b851_96.webp',
    tag: 'Compatibility'
  },
  {
    id: 'geyser',
    name: 'Geyser',
    description: 'Bridge plugin enabling Minecraft Bedrock Edition players (mobile, console) to join Java Edition servers.',
    author: 'GeyserMC',
    source: 'modrinth',
    slug: 'geyser',
    downloads: 850000,
    iconUrl: 'https://cdn.modrinth.com/data/w0pv2nrm/7cf7a83d3ff6ba569b9c9f6f6b5952f9547d21b4_96.webp',
    tag: 'Crossplay'
  },
  {
    id: 'chunky',
    name: 'Chunky',
    description: 'Pre-generates chunks rapidly to eliminate server lag when players explore new areas.',
    author: 'pop4959',
    source: 'modrinth',
    slug: 'chunky',
    downloads: 600000,
    iconUrl: 'https://cdn.modrinth.com/data/fALzjamp/fa56fb4f2f0b9f029cb2d2c317dca52973ca9c81_96.webp',
    tag: 'Performance'
  },
  {
    id: 'spark',
    name: 'spark',
    description: 'Performance profiling and diagnostic tool for Minecraft servers (diagnose lag spikes and tick drops).',
    author: 'Luck',
    source: 'modrinth',
    slug: 'spark',
    downloads: 4100000,
    iconUrl: 'https://cdn.modrinth.com/data/l6YH9Als/7989d2cffc1ec9103c3937bb4a595cbfffeff4a8_96.webp',
    tag: 'Profiler'
  },
  {
    id: 'discordsrv',
    name: 'DiscordSRV',
    description: 'Connects your Minecraft server chat with your Discord server channels with 2-way sync.',
    author: 'Scarsz',
    source: 'modrinth',
    slug: 'discordsrv',
    downloads: 320000,
    iconUrl: 'https://cdn.modrinth.com/data/ELb1m10q/4754ceae97cb4e5a960fb5ce1c0fb7072492fec2_96.webp',
    tag: 'Social'
  },
  {
    id: 'multiverse-core',
    name: 'Multiverse-Core',
    description: 'Create, manage, and teleport between multiple worlds on your Minecraft server.',
    author: 'Multiverse',
    source: 'modrinth',
    slug: 'multiverse-core',
    downloads: 450000,
    iconUrl: 'https://cdn.modrinth.com/data/5b7r5S7x/7650f968c92a9557bfa373972233f2c5f11cbccf_96.webp',
    tag: 'Worlds'
  }
];

app.get('/api/plugins/popular', authMiddleware, (req, res) => {
  return res.json({ plugins: POPULAR_PLUGINS });
});

app.get('/api/plugins/search', authMiddleware, async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || '').trim();
    const source = (req.query.source || 'all').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!query) {
      return res.json({ plugins: POPULAR_PLUGINS });
    }

    const results = [];

    // Search Modrinth
    if (source === 'all' || source === 'modrinth') {
      try {
        const facets = encodeURIComponent(JSON.stringify([['project_type:plugin']]));
        const modrinthUrl = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${facets}&limit=${limit}`;
        const mRes = await fetch(modrinthUrl, {
          headers: { 'User-Agent': 'akm-org/akm-sftp-manager/1.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.hits && Array.isArray(mData.hits)) {
            for (const hit of mData.hits) {
              results.push({
                id: hit.project_id,
                slug: hit.slug || hit.project_id,
                name: hit.title,
                description: hit.description || '',
                author: hit.author || 'Modrinth Creator',
                downloads: hit.downloads || 0,
                iconUrl: hit.icon_url || null,
                source: 'modrinth',
                categories: hit.display_categories || hit.categories || [],
                versions: (hit.versions || []).slice(-5),
              });
            }
          }
        }
      } catch (mErr) {
        console.warn('Modrinth search error:', mErr.message);
      }
    }

    // Search SpigotMC (via Spiget)
    if (source === 'all' || source === 'spigot') {
      try {
        const spigetUrl = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=${limit}&fields=id,name,tag,downloads,rating,icon`;
        const sRes = await fetch(spigetUrl, {
          headers: { 'User-Agent': 'AKM-SFTP-PluginManager/1.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (Array.isArray(sData)) {
            for (const item of sData) {
              let iconUrl = null;
              if (item.icon?.data) {
                iconUrl = `data:image/png;base64,${item.icon.data}`;
              } else if (item.icon?.url) {
                iconUrl = item.icon.url.startsWith('http') ? item.icon.url : 'https://www.spigotmc.org/' + item.icon.url;
              }

              results.push({
                id: String(item.id),
                slug: String(item.id),
                name: item.name,
                description: item.tag || 'SpigotMC Resource',
                author: 'SpigotMC Community',
                downloads: item.downloads || 0,
                iconUrl,
                source: 'spigot',
                categories: ['spigot'],
                rating: item.rating?.average || 0,
              });
            }
          }
        }
      } catch (sErr) {
        console.warn('Spiget search error:', sErr.message);
      }
    }

    results.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    return res.json({ plugins: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/install', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
      return res.status(400).json({ error: 'Active SFTP/FTP session is required to install plugins.' });
    }

    let { source, slug, projectId, targetDir, name } = req.body;
    const finalDir = (targetDir && targetDir.trim()) ? targetDir.trim() : '/plugins';

    let downloadUrl = req.body.downloadUrl;
    let filename = req.body.filename;

    if (!downloadUrl) {
      if (source === 'modrinth') {
        const idOrSlug = slug || projectId;
        if (!idOrSlug) return res.status(400).json({ error: 'Project slug is required for Modrinth.' });

        const vRes = await fetch(`https://api.modrinth.com/v2/project/${idOrSlug}/version`, {
          headers: { 'User-Agent': 'akm-org/akm-sftp-manager/1.0' },
          signal: AbortSignal.timeout(9000),
        });
        if (!vRes.ok) throw new Error(`Could not fetch plugin versions from Modrinth (${vRes.status})`);
        const versions = await vRes.json();
        if (!Array.isArray(versions) || versions.length === 0) {
          throw new Error('No downloadable versions found for this plugin on Modrinth.');
        }

        const latest = versions[0];
        const jarFile = (latest.files || []).find(f => f.primary && f.filename.endsWith('.jar'))
          || (latest.files || []).find(f => f.filename.endsWith('.jar'))
          || (latest.files || [])[0];

        if (!jarFile || !jarFile.url) {
          throw new Error('Could not find .jar file in Modrinth release.');
        }

        downloadUrl = jarFile.url;
        filename = jarFile.filename;
      } else if (source === 'spigot') {
        const resId = projectId || slug;
        if (!resId) return res.status(400).json({ error: 'Resource ID is required for Spigot.' });
        downloadUrl = `https://api.spiget.org/v2/resources/${resId}/download`;
        const cleanName = (name || `plugin-${resId}`).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        filename = cleanName.endsWith('.jar') ? cleanName : `${cleanName}.jar`;
      } else {
        return res.status(400).json({ error: 'Unsupported plugin source. Choose modrinth or spigot.' });
      }
    }

    if (!filename) {
      filename = 'plugin.jar';
    }

    // Download the .jar file buffer
    const dlRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'AKM-SFTP-PluginManager/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(35000),
    });

    if (!dlRes.ok) {
      throw new Error(`Failed to download plugin binary (${dlRes.status} ${dlRes.statusText})`);
    }

    const disposition = dlRes.headers.get('content-disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (match && match[1] && match[1].endsWith('.jar')) {
        filename = match[1];
      }
    }

    const arrayBuffer = await dlRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload directly to server plugins folder
    const uploadResult = await SFTPManager.uploadBuffer(sessionId, req.user.id, buffer, finalDir, filename);

    return res.json({
      success: true,
      message: `Plugin '${filename}' installed successfully to ${uploadResult.path}`,
      plugin: {
        name: filename,
        path: uploadResult.path,
        size: buffer.length,
      },
    });
  } catch (err) {
    console.error('Plugin install error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/plugins/installed', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
      return res.status(400).json({ error: 'Active session required' });
    }

    let targetDir = (req.query.path || '/plugins').trim();

    try {
      const data = await SFTPManager.list(sessionId, req.user.id, targetDir);
      const jarFiles = (data.items || []).filter(item => !item.isDirectory && item.name.toLowerCase().endsWith('.jar'));
      return res.json({
        success: true,
        path: targetDir,
        plugins: jarFiles,
      });
    } catch (err) {
      // If default /plugins failed, try /default/plugins (common on Apex Hosting / Multicraft)
      if (targetDir === '/plugins') {
        try {
          const fallbackData = await SFTPManager.list(sessionId, req.user.id, '/default/plugins');
          const jarFiles = (fallbackData.items || []).filter(item => !item.isDirectory && item.name.toLowerCase().endsWith('.jar'));
          return res.json({
            success: true,
            path: '/default/plugins',
            plugins: jarFiles,
            detectedPath: '/default/plugins',
          });
        } catch (e2) {}
      }
      return res.json({
        success: true,
        path: targetDir,
        plugins: [],
        error: `Could not list directory '${targetDir}'. It may not exist yet or no plugins are installed.`,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/plugins/delete', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
      return res.status(400).json({ error: 'Active session required' });
    }

    const { path: fullPath, filename, dir } = req.body;
    let targetFile = fullPath;
    if (!targetFile && dir && filename) {
      targetFile = path.posix.join(dir, filename);
    }

    if (!targetFile) {
      return res.status(400).json({ error: 'Plugin file path is required.' });
    }

    const result = await SFTPManager.delete(sessionId, req.user.id, targetFile, false);
    return res.json({ success: true, message: 'Plugin deleted successfully', result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/plugins/detect', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
      return res.json({ path: '/plugins' });
    }

    // Try /default/plugins first (Apex Hosting / Multicraft)
    try {
      await SFTPManager.list(sessionId, req.user.id, '/default/plugins');
      return res.json({ path: '/default/plugins', hosting: 'Apex / Multicraft' });
    } catch (e) {}

    // Try /plugins
    try {
      await SFTPManager.list(sessionId, req.user.id, '/plugins');
      return res.json({ path: '/plugins', hosting: 'Standard' });
    } catch (e) {}

    return res.json({ path: '/plugins', hosting: 'Default' });
  } catch (err) {
    return res.json({ path: '/plugins' });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

export default app;
