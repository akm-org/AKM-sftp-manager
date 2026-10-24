# 🚀 AKM SFTP Manager

A modern, sleek, and secure web-based SFTP Client and Panel File Manager. Manage remote servers, browse directories, upload/download files, edit code and configurations directly in your browser, and securely store your SFTP server credentials in an AES-256-GCM encrypted vault.

---

## ✨ Features

- **🔐 User Accounts & Panel Authentication**
  - Multi-user support with bcrypt-hashed passwords.
  - JWT session authentication.
  - Panel users can create accounts and manage their own private server vaults.

- **🛡️ Secure SFTP Credential Vault**
  - Save SFTP connection profiles (Host, Port, Username, Password, Default Directory).
  - Credentials stored encrypted at rest using **AES-256-GCM** with unique IV and authentication tags.
  - Quick **"Test Connection"** feature to check server latency before connecting.
  - 1-Click instant connect to any saved server.

- **⚡ Quick Connect Mode**
  - Enter SFTP host, port (default 22), username, and password to connect immediately.
  - Option to auto-save quick connect sessions into your private vault.

- **📁 High-Performance Remote File Explorer**
  - Interactive breadcrumbs navigation and direct path jumping (`/var/www`, `/home/user`, etc.).
  - File search and dynamic filtering.
  - Color-coded icons for all file extensions (JS/TS, Python, PHP, HTML, CSS, Config, Archives, Images, Logs).
  - File size humanizer and last-modified timestamps.
  - Inactivity timeout management to prevent dangling SSH connections.

- **📝 Built-in Code & Text Editor**
  - View and edit remote files directly in the panel.
  - Line count, character count, and keyboard shortcut (`Ctrl+S` / `Cmd+S`) support to save remotely instantly.

- **📤 Drag & Drop Uploads and Downloads**
  - Drag and drop files anywhere onto the file list to upload to the active directory.
  - File picker upload support for multiple files.
  - One-click file downloading with direct browser download streams.

- **⚙️ Complete File & Folder Management**
  - Create new files and recursive folders.
  - Rename or move remote items.
  - Visual **Permissions (chmod)** dialog: interactive 3x3 checkbox matrix (Owner, Group, Public) dynamically synchronized with octal modes (`755`, `644`, etc.).
  - Safe delete confirmation modal.

- **🗄️ Zero-Configuration SQLite Database**
  - Built-in database support with zero external database dependencies.
  - Works out of the box on both **Bun** and **Node.js (Node 22+)**.

---

## 🛠️ Tech Stack

- **Backend:** Node.js / Bun, Express 5, `ssh2-sftp-client`, `bcryptjs`, `jsonwebtoken`, `multer`
- **Database:** Open-source SQLite (`bun:sqlite` / `node:sqlite`)
- **Cryptography:** AES-256-GCM for connection vault, Bcrypt (salt rounds 10) for account passwords
- **Frontend:** Vanilla JavaScript (SPA), Tailwind CSS, FontAwesome 6, Google Inter & JetBrains Mono fonts

---

## 🚀 Quick Start

### 1. Prerequisites
- **Bun** (recommended) or **Node.js 22+**
- Git

### 2. Clone and Setup
```bash
git clone https://github.com/akm-org/AKM-sftp-manager.git
cd AKM-sftp-manager
```

### 3. Install Dependencies
```bash
# With Bun (fastest)
bun install

# Or with npm
npm install
```

### 4. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional: customize `PORT`, `JWT_SECRET`, or `DEFAULT_SFTP_HOST`)*

### 5. Start the Server
```bash
# With Bun
bun run src/server.js

# Or with Node
npm start
```
Visit **`http://localhost:3000`** in your browser.

---

## 🐳 Docker Deployment

Run with Docker Compose:
```bash
docker compose up -d
```
The panel will be live on port `3000` with persistent database storage in `./data`.

---

## 🔒 Security Architecture

| Feature | Mechanism |
|---|---|
| **Account Passwords** | Bcrypt hash with 10 salt rounds |
| **Connection Credentials** | AES-256-GCM authenticated encryption |
| **API Authentication** | Signed JWT bearer tokens |
| **Connection Pooling** | In-memory session tracking with auto-disconnect on idle timeout |
| **File Transfers** | Direct streaming over secure SFTP protocol (SSH port 22) |

---

## 📄 License

MIT License. Developed for AKM Panel & Cloud Infrastructure.
