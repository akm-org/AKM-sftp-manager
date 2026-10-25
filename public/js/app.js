// AKM SFTP Manager - Frontend Application
(function () {
  'use strict';

  // --- STATE ---
  const state = {
    token: localStorage.getItem('akm_sftp_token') || null,
    user: null,
    sessionId: localStorage.getItem('akm_sftp_sessionId') || null,
    sessionInfo: null,
    currentPath: '/',
    files: [],
    connections: [],
    filterQuery: '',
    editorFilePath: null,
    pluginsTargetDir: localStorage.getItem('akm_plugins_target_dir') || '/plugins',
    pluginsList: [],
    installedPlugins: [],
    pluginQuery: '',
    pluginSource: 'all',
    isPluginsLoaded: false,
  };

  // --- DOM ELEMENTS ---
  const el = {
    authSection: document.getElementById('authSection'),
    appSection: document.getElementById('appSection'),
    userMenu: document.getElementById('userMenu'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    logoutBtn: document.getElementById('logoutBtn'),
    connectionStatusBadge: document.getElementById('connectionStatusBadge'),
    statusPulse: document.getElementById('statusPulse'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    disconnectHeaderBtn: document.getElementById('disconnectHeaderBtn'),
    toastContainer: document.getElementById('toastContainer'),

    // Auth forms
    tabLoginBtn: document.getElementById('tabLoginBtn'),
    tabRegisterBtn: document.getElementById('tabRegisterBtn'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    regUsername: document.getElementById('regUsername'),
    regEmail: document.getElementById('regEmail'),
    regPassword: document.getElementById('regPassword'),

    // Views
    viewFilesBtn: document.getElementById('viewFilesBtn'),
    viewPluginsBtn: document.getElementById('viewPluginsBtn'),
    viewVaultBtn: document.getElementById('viewVaultBtn'),
    fileExplorerView: document.getElementById('fileExplorerView'),
    pluginsView: document.getElementById('pluginsView'),
    vaultView: document.getElementById('vaultView'),
    pluginsBadgeCount: document.getElementById('pluginsBadgeCount'),
    vaultBadgeCount: document.getElementById('vaultBadgeCount'),
    notConnectedBanner: document.getElementById('notConnectedBanner'),
    explorerContainer: document.getElementById('explorerContainer'),
    connectionsGrid: document.getElementById('connectionsGrid'),
    emptyConnectionsState: document.getElementById('emptyConnectionsState'),
    openPluginsFromExplorerBtn: document.getElementById('openPluginsFromExplorerBtn'),

    // Plugins Manager UI
    pluginsServerStatus: document.getElementById('pluginsServerStatus'),
    pluginsTargetDirInput: document.getElementById('pluginsTargetDirInput'),
    savePluginsTargetDirBtn: document.getElementById('savePluginsTargetDirBtn'),
    autoDetectPluginsDirBtn: document.getElementById('autoDetectPluginsDirBtn'),
    subTabBrowseBtn: document.getElementById('subTabBrowseBtn'),
    subTabInstalledBtn: document.getElementById('subTabInstalledBtn'),
    browsePluginsSection: document.getElementById('browsePluginsSection'),
    installedPluginsSection: document.getElementById('installedPluginsSection'),
    installedCountBadge: document.getElementById('installedCountBadge'),
    refreshPluginsBtn: document.getElementById('refreshPluginsBtn'),
    pluginUploadInput: document.getElementById('pluginUploadInput'),
    pluginSearchInput: document.getElementById('pluginSearchInput'),
    pluginSourceSelect: document.getElementById('pluginSourceSelect'),
    pluginSearchSubmitBtn: document.getElementById('pluginSearchSubmitBtn'),
    pluginCardsGrid: document.getElementById('pluginCardsGrid'),
    pluginsLoading: document.getElementById('pluginsLoading'),
    pluginsEmptyState: document.getElementById('pluginsEmptyState'),
    installedPluginsList: document.getElementById('installedPluginsList'),
    installedLoading: document.getElementById('installedLoading'),
    noInstalledPlugins: document.getElementById('noInstalledPlugins'),
    installedSummaryBadge: document.getElementById('installedSummaryBadge'),
    installedLocationText: document.getElementById('installedLocationText'),
    openPluginsInExplorerBtn: document.getElementById('openPluginsInExplorerBtn'),
    gotoBrowseBtn: document.getElementById('gotoBrowseBtn'),

    // Explorer UI
    breadcrumbsList: document.getElementById('breadcrumbsList'),
    filterInput: document.getElementById('filterInput'),
    directPathToggleBtn: document.getElementById('directPathToggleBtn'),
    directPathBar: document.getElementById('directPathBar'),
    directPathInput: document.getElementById('directPathInput'),
    directPathGoBtn: document.getElementById('directPathGoBtn'),
    navUpBtn: document.getElementById('navUpBtn'),
    navRefreshBtn: document.getElementById('navRefreshBtn'),
    fileTableBody: document.getElementById('fileTableBody'),
    emptyDirIndicator: document.getElementById('emptyDirIndicator'),
    explorerLoading: document.getElementById('explorerLoading'),
    directoryItemCount: document.getElementById('directoryItemCount'),
    directoryTotalSize: document.getElementById('directoryTotalSize'),
    fileUploadInput: document.getElementById('fileUploadInput'),
    dropZone: document.getElementById('dropZone'),
    dropOverlay: document.getElementById('dropOverlay'),

    // Action buttons
    quickConnectModalBtn: document.getElementById('quickConnectModalBtn'),
    addNewConnectionBtn: document.getElementById('addNewConnectionBtn'),
    vaultAddBtn: document.getElementById('vaultAddBtn'),
    emptyAddBtn: document.getElementById('emptyAddBtn'),
    newFileBtn: document.getElementById('newFileBtn'),
    newFolderBtn: document.getElementById('newFolderBtn'),

    // Modals
    quickConnectModal: document.getElementById('quickConnectModal'),
    quickConnectForm: document.getElementById('quickConnectForm'),
    qcProtocol: document.getElementById('qcProtocol'),
    qcHost: document.getElementById('qcHost'),
    qcPort: document.getElementById('qcPort'),
    qcUsername: document.getElementById('qcUsername'),
    qcPassword: document.getElementById('qcPassword'),
    qcPath: document.getElementById('qcPath'),
    qcSaveConnection: document.getElementById('qcSaveConnection'),
    qcNameGroup: document.getElementById('qcNameGroup'),
    qcName: document.getElementById('qcName'),

    connectionModal: document.getElementById('connectionModal'),
    connectionModalTitle: document.getElementById('connectionModalTitle'),
    connectionForm: document.getElementById('connectionForm'),
    connEditId: document.getElementById('connEditId'),
    connProtocol: document.getElementById('connProtocol'),
    connName: document.getElementById('connName'),
    connHost: document.getElementById('connHost'),
    connPort: document.getElementById('connPort'),
    connUsername: document.getElementById('connUsername'),
    connPassword: document.getElementById('connPassword'),
    connDefaultPath: document.getElementById('connDefaultPath'),
    connPluginsPath: document.getElementById('connPluginsPath'),
    passwordHint: document.getElementById('passwordHint'),
    testFormConnBtn: document.getElementById('testFormConnBtn'),

    editorModal: document.getElementById('editorModal'),
    editorFileName: document.getElementById('editorFileName'),
    editorFilePath: document.getElementById('editorFilePath'),
    editorStats: document.getElementById('editorStats'),
    editorContent: document.getElementById('editorContent'),
    editorSaveBtn: document.getElementById('editorSaveBtn'),
    editorStatusText: document.getElementById('editorStatusText'),

    newItemModal: document.getElementById('newItemModal'),
    newItemTitle: document.getElementById('newItemTitle'),
    newItemLabel: document.getElementById('newItemLabel'),
    newItemType: document.getElementById('newItemType'),
    newItemName: document.getElementById('newItemName'),
    newItemForm: document.getElementById('newItemForm'),

    renameModal: document.getElementById('renameModal'),
    renameForm: document.getElementById('renameForm'),
    renameOldPath: document.getElementById('renameOldPath'),
    renameNewName: document.getElementById('renameNewName'),

    chmodModal: document.getElementById('chmodModal'),
    chmodForm: document.getElementById('chmodForm'),
    chmodTarget: document.getElementById('chmodTarget'),
    chmodPath: document.getElementById('chmodPath'),
    chmodOctal: document.getElementById('chmodOctal'),

    deleteModal: document.getElementById('deleteModal'),
    deleteTargetPath: document.getElementById('deleteTargetPath'),
    deleteTargetName: document.getElementById('deleteTargetName'),
    deleteTargetIsDir: document.getElementById('deleteTargetIsDir'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
  };

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast animate-slide-down flex items-center gap-3 p-3.5 rounded-xl border text-xs font-medium max-w-sm w-full`;

    let icon = 'fa-circle-info text-cyan-400';
    let bg = 'bg-slate-900/95 border-slate-700 text-slate-200';

    if (type === 'success') {
      icon = 'fa-circle-check text-emerald-400';
      bg = 'bg-slate-900/95 border-emerald-500/30 text-white';
    } else if (type === 'error') {
      icon = 'fa-circle-xmark text-rose-400';
      bg = 'bg-slate-900/95 border-rose-500/30 text-white';
    } else if (type === 'warning') {
      icon = 'fa-triangle-exclamation text-amber-400';
      bg = 'bg-slate-900/95 border-amber-500/30 text-white';
    }

    toast.className += ` ${bg}`;
    toast.innerHTML = `
      <i class="fa-solid ${icon} text-base shrink-0"></i>
      <span class="flex-1 break-words">${message}</span>
      <button class="text-slate-500 hover:text-slate-300 transition shrink-0 ml-2">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    toast.querySelector('button').addEventListener('click', () => toast.remove());
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 4000);
  }

  // --- API HELPER ---
  async function api(endpoint, options = {}) {
    const headers = options.headers || {};
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    if (state.sessionId) {
      headers['x-session-id'] = state.sessionId;
    }
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // If unauthorized token, logout
      if (!endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
        handleLogout();
        showToast('Session expired. Please log in again.', 'warning');
      }
    }

    const contentType = response.headers.get('content-type');
    let data = null;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else if (response.ok) {
      data = await response.blob();
    } else {
      data = { error: await response.text() };
    }

    if (!response.ok) {
      throw new Error((data && data.error) || 'Request failed with status ' + response.status);
    }

    return data;
  }

  // --- AUTH FUNCTIONS ---
  async function checkAuth() {
    if (!state.token) {
      showAuth();
      return;
    }

    try {
      const res = await api('/api/auth/me');
      state.user = res.user;
      showApp();
      loadDefaultConfig();
      loadConnections();
      checkSessionStatus();
    } catch (err) {
      handleLogout();
    }
  }

  function showAuth() {
    el.authSection.classList.remove('hidden');
    el.appSection.classList.add('hidden');
    el.userMenu.classList.add('hidden');
    updateStatusBadge(false);
  }

  function showApp() {
    el.authSection.classList.add('hidden');
    el.appSection.classList.remove('hidden');
    el.userMenu.classList.remove('hidden');
    el.usernameDisplay.textContent = state.user ? state.user.username : 'User';
  }

  function handleLogout() {
    state.token = null;
    state.user = null;
    state.sessionId = null;
    state.sessionInfo = null;
    localStorage.removeItem('akm_sftp_token');
    localStorage.removeItem('akm_sftp_sessionId');
    showAuth();
    showToast('Logged out successfully', 'info');
  }

  // --- LOAD DEFAULTS ---
  async function loadDefaultConfig() {
    try {
      const defaults = await api('/api/config/defaults');
      if (defaults.defaultHost) {
        el.qcHost.value = defaults.defaultHost;
      }
      if (defaults.defaultPort) {
        el.qcPort.value = defaults.defaultPort;
      }
      if (defaults.defaultUsername) {
        el.qcUsername.value = defaults.defaultUsername;
      }
    } catch (e) {}
  }

  // --- STATUS BADGE ---
  function updateStatusBadge(connected, info = null) {
    if (connected && info) {
      el.connectionStatusBadge.classList.remove('hidden');
      el.connectionStatusBadge.classList.remove('text-slate-400');
      el.connectionStatusBadge.classList.add('text-emerald-300', 'border-emerald-500/30', 'bg-emerald-950/20');
      el.statusPulse.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
      el.statusDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500';
      el.statusText.textContent = `${info.username}@${info.host}:${info.port}`;
      el.disconnectHeaderBtn.classList.remove('hidden');

      el.notConnectedBanner.classList.add('hidden');
      el.explorerContainer.classList.remove('hidden');

      if (el.pluginsServerStatus) {
        el.pluginsServerStatus.innerHTML = `Target Server: <span class="text-emerald-400 font-semibold">${info.username}@${info.host}:${info.port}</span> <span class="text-[10px] text-slate-500 font-mono uppercase">(${(info.protocol || 'sftp').toUpperCase()})</span>`;
      }

      if (info.pluginsPath) {
        state.pluginsTargetDir = info.pluginsPath;
        if (el.pluginsTargetDirInput) el.pluginsTargetDirInput.value = info.pluginsPath;
      }
    } else {
      el.connectionStatusBadge.classList.add('text-slate-400');
      el.connectionStatusBadge.classList.remove('text-emerald-300', 'border-emerald-500/30', 'bg-emerald-950/20');
      el.statusPulse.className = 'hidden';
      el.statusDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-600';
      el.statusText.textContent = 'No Active Connection';
      el.disconnectHeaderBtn.classList.add('hidden');

      el.notConnectedBanner.classList.remove('hidden');
      el.explorerContainer.classList.add('hidden');

      if (el.pluginsServerStatus) {
        el.pluginsServerStatus.innerHTML = 'Target Server: <span class="text-rose-400 font-medium">No Active Connection</span>';
      }
    }
  }

  async function checkSessionStatus() {
    if (!state.sessionId) {
      updateStatusBadge(false);
      return;
    }
    try {
      const res = await api('/api/sftp/status');
      if (res.connected && res.session) {
        state.sessionInfo = res.session.info;
        state.currentPath = res.session.currentPath || '/';
        updateStatusBadge(true, state.sessionInfo);
        loadDirectory(state.currentPath);
      } else {
        state.sessionId = null;
        localStorage.removeItem('akm_sftp_sessionId');
        updateStatusBadge(false);
      }
    } catch (err) {
      state.sessionId = null;
      localStorage.removeItem('akm_sftp_sessionId');
      updateStatusBadge(false);
    }
  }

  // --- CONNECTIONS VAULT ---
  async function loadConnections() {
    try {
      const res = await api('/api/connections');
      state.connections = res.connections || [];
      el.vaultBadgeCount.textContent = state.connections.length;
      renderConnectionsGrid();
    } catch (err) {
      showToast('Failed to load saved connections: ' + err.message, 'error');
    }
  }

  function renderConnectionsGrid() {
    el.connectionsGrid.innerHTML = '';
    if (state.connections.length === 0) {
      el.emptyConnectionsState.classList.remove('hidden');
      return;
    }

    el.emptyConnectionsState.classList.add('hidden');
    state.connections.forEach((conn) => {
      const card = document.createElement('div');
      card.className =
        'bg-cardBg border border-cardBorder hover:border-slate-700/80 rounded-2xl p-5 shadow-xl transition-all flex flex-col justify-between group';

      const lastConn = conn.last_connected_at
        ? new Date(conn.last_connected_at).toLocaleString()
        : 'Never';

      card.innerHTML = `
        <div>
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                <i class="fa-solid fa-server"></i>
              </div>
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="font-bold text-white text-sm tracking-tight truncate max-w-[150px]">${escapeHtml(conn.name)}</h4>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${conn.auth_type === 'ftp' || conn.port === 21 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}">${conn.auth_type === 'ftp' || conn.port === 21 ? 'FTP' : 'SFTP'}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(conn.username)}@${escapeHtml(conn.host)}:${conn.port}</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button class="edit-conn-btn p-1.5 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800" data-id="${conn.id}" title="Edit Connection">
                <i class="fa-regular fa-pen-to-square text-xs"></i>
              </button>
              <button class="delete-conn-btn p-1.5 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800" data-id="${conn.id}" data-name="${escapeHtml(conn.name)}" title="Delete Connection">
                <i class="fa-regular fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>

          <div class="space-y-1.5 py-2.5 border-t border-b border-cardBorder text-xs font-mono text-slate-400 mb-4">
            <div class="flex justify-between">
              <span class="text-slate-500">Default Path:</span>
              <span class="text-slate-300 truncate max-w-[150px]">${escapeHtml(conn.default_path || '/')}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Last Connected:</span>
              <span class="text-slate-400 text-[11px]">${lastConn}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button class="test-conn-btn flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition" data-id="${conn.id}">
            <i class="fa-solid fa-vial text-cyan-400"></i>
            <span>Test</span>
          </button>
          <button class="connect-conn-btn flex-[2] py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition" data-id="${conn.id}">
            <i class="fa-solid fa-plug text-xs"></i>
            <span>Connect</span>
          </button>
        </div>
      `;

      // Connect button
      card.querySelector('.connect-conn-btn').addEventListener('click', () => connectSaved(conn.id));

      // Test button
      card.querySelector('.test-conn-btn').addEventListener('click', (e) => testSavedConnection(conn.id, e.currentTarget));

      // Edit button
      card.querySelector('.edit-conn-btn').addEventListener('click', () => openEditConnectionModal(conn));

      // Delete button
      card.querySelector('.delete-conn-btn').addEventListener('click', () => deleteSavedConnection(conn.id, conn.name));

      el.connectionsGrid.appendChild(card);
    });
  }

  async function testSavedConnection(connectionId, btn) {
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-cyan-400"></i> <span>Testing...</span>`;

    try {
      const res = await api('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      });

      if (res.success) {
        showToast(`Server reached! Latency: ${res.latencyMs}ms`, 'success');
        btn.innerHTML = `<i class="fa-solid fa-check text-emerald-400"></i> <span>${res.latencyMs}ms</span>`;
      } else {
        showToast(`Test failed: ${res.error}`, 'error');
        btn.innerHTML = `<i class="fa-solid fa-xmark text-rose-400"></i> <span>Failed</span>`;
      }
    } catch (err) {
      showToast(`Test error: ${err.message}`, 'error');
      btn.innerHTML = `<i class="fa-solid fa-xmark text-rose-400"></i> <span>Failed</span>`;
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }, 2500);
    }
  }

  async function connectSaved(connectionId) {
    showToast('Connecting to remote SFTP server...', 'info');
    try {
      const res = await api('/api/sftp/connect', {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      });

      state.sessionId = res.sessionId;
      state.sessionInfo = res.info;
      localStorage.setItem('akm_sftp_sessionId', res.sessionId);

      updateStatusBadge(true, res.info);
      switchView('files');
      showToast('Connected to ' + res.info.name, 'success');
      loadDirectory(res.info.initialPath || '/');
      loadConnections();
    } catch (err) {
      if (err.message && err.message.includes('Stored password could not be decrypted')) {
        const found = state.connections.find((c) => c.id === connectionId);
        if (found) {
          openEditConnectionModal(found);
          showToast('Please re-enter your password once and click Save Connection.', 'warning');
          return;
        }
      }
      showToast('Connection failed: ' + err.message, 'error');
    }
  }

  async function deleteSavedConnection(id, name) {
    if (!confirm(`Are you sure you want to delete saved connection "${name}"?`)) return;

    try {
      await api(`/api/connections/${id}`, { method: 'DELETE' });
      showToast('Connection deleted', 'info');
      loadConnections();
    } catch (err) {
      showToast('Failed to delete connection: ' + err.message, 'error');
    }
  }

  function openEditConnectionModal(conn) {
    el.connEditId.value = conn.id;
    el.connectionModalTitle.textContent = 'Edit Connection';
    el.connProtocol.value = conn.auth_type === 'ftp' || conn.port === 21 ? 'ftp' : 'sftp';
    el.connName.value = conn.name;
    el.connHost.value = conn.host;
    el.connPort.value = conn.port;
    el.connUsername.value = conn.username;
    el.connPassword.value = '';
    el.connDefaultPath.value = conn.default_path || '/';
    if (el.connPluginsPath) el.connPluginsPath.value = conn.plugins_path || '/plugins';
    el.passwordHint.classList.remove('hidden');
    openModal(el.connectionModal);
  }

  function openNewConnectionModal() {
    el.connEditId.value = '';
    el.connectionModalTitle.textContent = 'Save Connection';
    el.connectionForm.reset();
    el.connProtocol.value = 'sftp';
    el.connPort.value = '22';
    el.connDefaultPath.value = '/';
    if (el.connPluginsPath) el.connPluginsPath.value = '/plugins';
    el.passwordHint.classList.add('hidden');
    openModal(el.connectionModal);
  }

  // --- SFTP FILE EXPLORER ---
  async function loadDirectory(path = '/') {
    el.explorerLoading.classList.remove('hidden');
    el.emptyDirIndicator.classList.add('hidden');
    el.fileTableBody.innerHTML = '';

    try {
      const res = await api(`/api/sftp/list?path=${encodeURIComponent(path)}`);
      state.currentPath = res.path;
      state.files = res.items || [];
      renderBreadcrumbs(res.path);
      renderFileList();
    } catch (err) {
      showToast('Failed to load directory: ' + err.message, 'error');
    } finally {
      el.explorerLoading.classList.add('hidden');
    }
  }

  function renderBreadcrumbs(fullPath) {
    el.breadcrumbsList.innerHTML = '';
    const parts = fullPath.split('/').filter(Boolean);

    // Root button
    const rootBtn = document.createElement('button');
    rootBtn.className = 'px-2 py-1 rounded hover:bg-slate-800 text-indigo-400 font-bold transition flex items-center gap-1';
    rootBtn.innerHTML = '<i class="fa-solid fa-server text-xs"></i> <span>/</span>';
    rootBtn.addEventListener('click', () => loadDirectory('/'));
    el.breadcrumbsList.appendChild(rootBtn);

    let cumulative = '';
    parts.forEach((part, index) => {
      cumulative += '/' + part;
      const curPath = cumulative;

      const sep = document.createElement('span');
      sep.className = 'text-slate-600 px-0.5 select-none';
      sep.textContent = '/';
      el.breadcrumbsList.appendChild(sep);

      const partBtn = document.createElement('button');
      const isLast = index === parts.length - 1;
      partBtn.className = `px-1.5 py-0.5 rounded transition ${
        isLast
          ? 'font-bold text-white bg-slate-800/80'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`;
      partBtn.textContent = part;
      partBtn.addEventListener('click', () => loadDirectory(curPath));
      el.breadcrumbsList.appendChild(partBtn);
    });

    el.directPathInput.value = fullPath;
  }

  function getFileIcon(item) {
    if (item.isDirectory) {
      return '<i class="fa-solid fa-folder text-amber-400 text-sm"></i>';
    }
    const ext = item.name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js':
      case 'mjs':
      case 'cjs':
      case 'ts':
        return '<i class="fa-brands fa-js text-yellow-400 text-sm"></i>';
      case 'py':
        return '<i class="fa-brands fa-python text-sky-400 text-sm"></i>';
      case 'php':
        return '<i class="fa-brands fa-php text-indigo-400 text-sm"></i>';
      case 'html':
      case 'htm':
        return '<i class="fa-brands fa-html5 text-orange-500 text-sm"></i>';
      case 'css':
      case 'scss':
        return '<i class="fa-brands fa-css3-alt text-cyan-400 text-sm"></i>';
      case 'json':
      case 'yaml':
      case 'yml':
      case 'env':
        return '<i class="fa-solid fa-gear text-emerald-400 text-sm"></i>';
      case 'sh':
      case 'bash':
        return '<i class="fa-solid fa-terminal text-green-400 text-sm"></i>';
      case 'zip':
      case 'tar':
      case 'gz':
      case 'rar':
      case '7z':
        return '<i class="fa-solid fa-file-zipper text-rose-400 text-sm"></i>';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'svg':
        return '<i class="fa-regular fa-file-image text-purple-400 text-sm"></i>';
      case 'md':
      case 'txt':
      case 'log':
        return '<i class="fa-regular fa-file-lines text-slate-300 text-sm"></i>';
      default:
        return '<i class="fa-regular fa-file text-slate-400 text-sm"></i>';
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderFileList() {
    el.fileTableBody.innerHTML = '';
    const query = state.filterQuery.toLowerCase().trim();

    const filtered = state.files.filter((item) =>
      query ? item.name.toLowerCase().includes(query) : true
    );

    el.directoryItemCount.textContent = `${state.files.length} items`;
    const totalBytes = state.files.reduce((acc, cur) => acc + (cur.size || 0), 0);
    el.directoryTotalSize.textContent = formatBytes(totalBytes);

    if (filtered.length === 0) {
      el.emptyDirIndicator.classList.remove('hidden');
      return;
    }

    el.emptyDirIndicator.classList.add('hidden');

    filtered.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'border-b border-cardBorder transition-colors group cursor-pointer';

      const fullItemPath =
        state.currentPath === '/'
          ? `/${item.name}`
          : `${state.currentPath}/${item.name}`;

      const icon = getFileIcon(item);
      const modDate = item.modifyTime
        ? new Date(item.modifyTime).toLocaleString()
        : '-';

      const isEditable = !item.isDirectory;

      row.innerHTML = `
        <td class="py-2.5 px-4 text-center shrink-0 hidden sm:table-cell">${icon}</td>
        <td class="py-2.5 px-3 sm:px-4 text-white font-medium flex items-center gap-2.5 select-none min-w-0">
          <div class="sm:hidden shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800/90 text-sm">${icon}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="item-name truncate font-medium text-xs sm:text-sm text-slate-100 max-w-[160px] sm:max-w-md">${escapeHtml(item.name)}</span>
              ${item.isSymlink ? '<i class="fa-solid fa-link text-[10px] text-cyan-400" title="Symlink"></i>' : ''}
            </div>
            <div class="sm:hidden text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span>${item.isDirectory ? 'Directory' : formatBytes(item.size)}</span>
              <span>•</span>
              <span class="truncate max-w-[110px]">${modDate}</span>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap hidden sm:table-cell">${item.isDirectory ? '-' : formatBytes(item.size)}</td>
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap hidden md:table-cell">
          <span class="chmod-link hover:text-indigo-400 transition" title="Click to Chmod">${item.permissions || 'rw-r--r--'}</span>
        </td>
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap hidden sm:table-cell text-[11px]">${modDate}</td>
        <td class="py-2.5 px-2 sm:px-4 text-right whitespace-nowrap shrink-0">
          <div class="flex items-center justify-end gap-1 opacity-90 sm:opacity-70 group-hover:opacity-100 transition-opacity">
            ${
              isEditable
                ? `<button class="edit-file-btn p-1.5 sm:p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition" title="View & Edit File">
                    <i class="fa-regular fa-pen-to-square"></i>
                   </button>`
                : ''
            }
            ${
              !item.isDirectory
                ? `<button class="download-file-btn p-1.5 sm:p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition" title="Download">
                    <i class="fa-solid fa-download"></i>
                   </button>`
                : ''
            }
            <button class="chmod-btn p-1.5 sm:p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition hidden sm:inline-flex" title="Permissions (chmod)">
              <i class="fa-solid fa-key"></i>
            </button>
            <button class="rename-btn p-1.5 sm:p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition" title="Rename">
              <i class="fa-solid fa-font"></i>
            </button>
            <button class="delete-btn p-1.5 sm:p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition" title="Delete">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;

      // Row click / double click
      row.addEventListener('click', (e) => {
        // Prevent action button triggers
        if (e.target.closest('button') || e.target.closest('.chmod-link')) return;
        if (item.isDirectory) {
          loadDirectory(fullItemPath);
        } else {
          openFileEditor(fullItemPath, item.name);
        }
      });

      // Actions
      const editBtn = row.querySelector('.edit-file-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => openFileEditor(fullItemPath, item.name));
      }

      const dlBtn = row.querySelector('.download-file-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', () => downloadFile(fullItemPath, item.name));
      }

      const chmodTrigger = row.querySelector('.chmod-link');
      if (chmodTrigger) {
        chmodTrigger.addEventListener('click', () => openChmodModal(fullItemPath, item.permissions));
      }
      const chmodBtn = row.querySelector('.chmod-btn');
      if (chmodBtn) {
        chmodBtn.addEventListener('click', () => openChmodModal(fullItemPath, item.permissions));
      }

      const renameBtn = row.querySelector('.rename-btn');
      if (renameBtn) {
        renameBtn.addEventListener('click', () => openRenameModal(fullItemPath, item.name));
      }

      const delBtn = row.querySelector('.delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', () => openDeleteModal(fullItemPath, item.name, item.isDirectory));
      }

      el.fileTableBody.appendChild(row);
    });
  }

  // --- FILE ACTIONS ---
  async function openFileEditor(filePath, fileName) {
    el.editorFileName.textContent = fileName;
    el.editorFilePath.textContent = filePath;
    el.editorStatusText.textContent = 'Loading content...';
    el.editorContent.value = '';
    state.editorFilePath = filePath;
    openModal(el.editorModal);

    try {
      const res = await api(`/api/sftp/read?path=${encodeURIComponent(filePath)}`);
      el.editorContent.value = res.content || '';
      updateEditorStats();
      el.editorStatusText.textContent = `Loaded (${formatBytes(res.size)})`;
    } catch (err) {
      showToast('Error reading file: ' + err.message, 'error');
      el.editorStatusText.textContent = 'Error reading file';
    }
  }

  function updateEditorStats() {
    const text = el.editorContent.value;
    const lines = text.split('\n').length;
    el.editorStats.textContent = `${lines} lines, ${text.length} chars`;
  }

  async function saveFileEditor() {
    if (!state.editorFilePath) return;
    el.editorStatusText.textContent = 'Saving...';
    el.editorSaveBtn.disabled = true;

    try {
      await api('/api/sftp/write', {
        method: 'POST',
        body: JSON.stringify({
          path: state.editorFilePath,
          content: el.editorContent.value,
        }),
      });
      el.editorStatusText.textContent = 'Saved successfully';
      showToast('File saved successfully', 'success');
      loadDirectory(state.currentPath);
    } catch (err) {
      el.editorStatusText.textContent = 'Save failed: ' + err.message;
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      el.editorSaveBtn.disabled = false;
    }
  }

  function downloadFile(filePath, fileName) {
    showToast('Starting download for ' + fileName, 'info');
    const url = `/api/sftp/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(state.token)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      showToast(`Uploading ${file.name} (${i + 1}/${fileList.length})...`, 'info');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('remoteDir', state.currentPath);

      try {
        await api('/api/sftp/upload', {
          method: 'POST',
          body: formData,
        });
        showToast(`Uploaded ${file.name} successfully`, 'success');
      } catch (err) {
        showToast(`Upload failed for ${file.name}: ${err.message}`, 'error');
      }
    }

    loadDirectory(state.currentPath);
  }

  function openRenameModal(filePath, currentName) {
    el.renameOldPath.value = filePath;
    el.renameNewName.value = currentName;
    openModal(el.renameModal);
    setTimeout(() => el.renameNewName.select(), 50);
  }

  function openChmodModal(filePath, permissions) {
    el.chmodTarget.value = filePath;
    el.chmodPath.textContent = filePath;
    // Guess octal from rwx format if available
    let octal = '755';
    if (permissions && permissions.length === 9) {
      const calc = (r, w, x) => (r === '-' ? 0 : 4) + (w === '-' ? 0 : 2) + (x === '-' ? 0 : 1);
      const u = calc(permissions[0], permissions[1], permissions[2]);
      const g = calc(permissions[3], permissions[4], permissions[5]);
      const o = calc(permissions[6], permissions[7], permissions[8]);
      octal = `${u}${g}${o}`;
    }
    el.chmodOctal.value = octal;
    syncChmodCheckboxes(octal);
    openModal(el.chmodModal);
  }

  function syncChmodCheckboxes(octalStr) {
    const pad = octalStr.padStart(3, '0').slice(-3);
    const u = parseInt(pad[0], 10) || 0;
    const g = parseInt(pad[1], 10) || 0;
    const o = parseInt(pad[2], 10) || 0;

    document.getElementById('perm_u_r').checked = (u & 4) !== 0;
    document.getElementById('perm_u_w').checked = (u & 2) !== 0;
    document.getElementById('perm_u_x').checked = (u & 1) !== 0;

    document.getElementById('perm_g_r').checked = (g & 4) !== 0;
    document.getElementById('perm_g_w').checked = (g & 2) !== 0;
    document.getElementById('perm_g_x').checked = (g & 1) !== 0;

    document.getElementById('perm_o_r').checked = (o & 4) !== 0;
    document.getElementById('perm_o_w').checked = (o & 2) !== 0;
    document.getElementById('perm_o_x').checked = (o & 1) !== 0;
  }

  function syncChmodOctalFromBoxes() {
    const calc = (rId, wId, xId) =>
      (document.getElementById(rId).checked ? 4 : 0) +
      (document.getElementById(wId).checked ? 2 : 0) +
      (document.getElementById(xId).checked ? 1 : 0);

    const u = calc('perm_u_r', 'perm_u_w', 'perm_u_x');
    const g = calc('perm_g_r', 'perm_g_w', 'perm_g_x');
    const o = calc('perm_o_r', 'perm_o_w', 'perm_o_x');
    el.chmodOctal.value = `${u}${g}${o}`;
  }

  function openDeleteModal(filePath, name, isDir) {
    el.deleteTargetPath.value = filePath;
    el.deleteTargetName.textContent = name;
    el.deleteTargetIsDir.value = isDir ? 'true' : 'false';
    openModal(el.deleteModal);
  }

  // --- MODAL UTILS ---
  function openModal(modalEl) {
    modalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function closeModal(modalEl) {
    modalEl.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  // Close all modal-close buttons
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    });
  });

  // Close modals on clicking outside content
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // --- TAB SWITCHER ---
  function switchView(viewName) {
    el.fileExplorerView.classList.add('hidden');
    if (el.pluginsView) el.pluginsView.classList.add('hidden');
    el.vaultView.classList.add('hidden');

    const inactiveClass = 'tab-btn flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white whitespace-nowrap';
    const activeClassIndigo = 'tab-btn active flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition bg-indigo-600 text-white shadow whitespace-nowrap';
    const activeClassEmerald = 'tab-btn active flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition bg-emerald-600 text-white shadow whitespace-nowrap';

    el.viewFilesBtn.className = inactiveClass;
    if (el.viewPluginsBtn) el.viewPluginsBtn.className = inactiveClass;
    el.viewVaultBtn.className = inactiveClass;

    if (viewName === 'files') {
      el.fileExplorerView.classList.remove('hidden');
      el.viewFilesBtn.className = activeClassIndigo;
    } else if (viewName === 'plugins') {
      if (el.pluginsView) el.pluginsView.classList.remove('hidden');
      if (el.viewPluginsBtn) el.viewPluginsBtn.className = activeClassEmerald;
      initPluginsView();
    } else if (viewName === 'vault') {
      el.vaultView.classList.remove('hidden');
      el.viewVaultBtn.className = activeClassIndigo;
      loadConnections();
    }
  }

  el.viewFilesBtn.addEventListener('click', () => switchView('files'));
  if (el.viewPluginsBtn) el.viewPluginsBtn.addEventListener('click', () => switchView('plugins'));
  el.viewVaultBtn.addEventListener('click', () => switchView('vault'));
  if (el.openPluginsFromExplorerBtn) {
    el.openPluginsFromExplorerBtn.addEventListener('click', () => switchView('plugins'));
  }

  document.querySelectorAll('.trigger-vault-switch').forEach((btn) => {
    btn.addEventListener('click', () => switchView('vault'));
  });

  // --- MINECRAFT PLUGIN MANAGER FRONTEND ---

  function initPluginsView() {
    if (el.pluginsTargetDirInput) {
      el.pluginsTargetDirInput.value = state.pluginsTargetDir;
    }

    if (state.sessionInfo) {
      el.pluginsServerStatus.innerHTML = `Target Server: <span class="text-emerald-400 font-semibold">${escapeHtml(state.sessionInfo.username)}@${escapeHtml(state.sessionInfo.host)}:${state.sessionInfo.port}</span> <span class="text-[10px] text-slate-500 font-mono uppercase">(${(state.sessionInfo.protocol || 'sftp').toUpperCase()})</span>`;
    } else {
      el.pluginsServerStatus.innerHTML = `Target Server: <span class="text-rose-400 font-medium">No Active Connection</span> <span class="text-slate-500"> — connect via Quick Connect or Saved Vault</span>`;
    }

    if (!state.isPluginsLoaded) {
      loadPopularPlugins();
    }

    if (state.sessionId) {
      loadInstalledPlugins(false);
    }
  }

  function switchPluginSubTab(tab) {
    if (tab === 'browse') {
      el.browsePluginsSection.classList.remove('hidden');
      el.installedPluginsSection.classList.add('hidden');
      el.subTabBrowseBtn.className = 'subtab-btn active px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white shadow';
      el.subTabInstalledBtn.className = 'subtab-btn px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition text-slate-400 hover:text-white';
    } else {
      el.browsePluginsSection.classList.add('hidden');
      el.installedPluginsSection.classList.remove('hidden');
      el.subTabInstalledBtn.className = 'subtab-btn active px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 text-white shadow';
      el.subTabBrowseBtn.className = 'subtab-btn px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition text-slate-400 hover:text-white';
      loadInstalledPlugins();
    }
  }

  if (el.subTabBrowseBtn) el.subTabBrowseBtn.addEventListener('click', () => switchPluginSubTab('browse'));
  if (el.subTabInstalledBtn) el.subTabInstalledBtn.addEventListener('click', () => switchPluginSubTab('installed'));
  if (el.gotoBrowseBtn) el.gotoBrowseBtn.addEventListener('click', () => switchPluginSubTab('browse'));

  async function loadPopularPlugins() {
    el.pluginsLoading.classList.remove('hidden');
    el.pluginsEmptyState.classList.add('hidden');
    el.pluginCardsGrid.innerHTML = '';

    try {
      const res = await api('/api/plugins/popular');
      state.pluginsList = res.plugins || [];
      state.isPluginsLoaded = true;
      renderPluginCards(state.pluginsList);
    } catch (err) {
      showToast('Error loading popular plugins: ' + err.message, 'error');
    } finally {
      el.pluginsLoading.classList.add('hidden');
    }
  }

  async function searchMinecraftPlugins(query = '') {
    const q = query.trim();
    const source = el.pluginSourceSelect ? el.pluginSourceSelect.value : 'all';

    el.pluginsLoading.classList.remove('hidden');
    el.pluginsEmptyState.classList.add('hidden');
    el.pluginCardsGrid.innerHTML = '';

    try {
      const res = await api(`/api/plugins/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`);
      state.pluginsList = res.plugins || [];
      renderPluginCards(state.pluginsList);
      if (state.pluginsList.length === 0) {
        el.pluginsEmptyState.classList.remove('hidden');
      }
    } catch (err) {
      showToast('Search error: ' + err.message, 'error');
      el.pluginsEmptyState.classList.remove('hidden');
    } finally {
      el.pluginsLoading.classList.add('hidden');
    }
  }

  function renderPluginCards(plugins) {
    el.pluginCardsGrid.innerHTML = '';
    if (!plugins || plugins.length === 0) {
      el.pluginsEmptyState.classList.remove('hidden');
      return;
    }
    el.pluginsEmptyState.classList.add('hidden');

    plugins.forEach((plugin) => {
      const card = document.createElement('div');
      card.className = 'bg-slate-900/90 border border-cardBorder rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-md group relative overflow-hidden';

      const sourceBadge = plugin.source === 'modrinth'
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80 uppercase tracking-wider">Modrinth</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/80 uppercase tracking-wider">SpigotMC</span>`;

      let iconHtml = '';
      if (plugin.iconUrl) {
        iconHtml = `<img src="${escapeHtml(plugin.iconUrl)}" alt="${escapeHtml(plugin.name)}" class="w-12 h-12 rounded-xl object-contain bg-slate-800 border border-slate-700/60 p-1 shrink-0" onerror="this.onerror=null;this.parentNode.innerHTML='<div class=\\'w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 flex items-center justify-center shrink-0 text-xl\\'><i class=\\'fa-solid fa-cube\\'></i></div>';" />`;
      } else {
        iconHtml = `<div class="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 flex items-center justify-center shrink-0 text-xl"><i class="fa-solid fa-cube"></i></div>`;
      }

      const downloadsFormatted = typeof plugin.downloads === 'number'
        ? (plugin.downloads >= 1000000 ? (plugin.downloads / 1000000).toFixed(1) + 'M' : (plugin.downloads >= 1000 ? (plugin.downloads / 1000).toFixed(0) + 'K' : plugin.downloads))
        : (plugin.downloads || '10K+');

      card.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              ${iconHtml}
              <div class="min-w-0">
                <h4 class="font-bold text-white text-sm sm:text-base leading-tight truncate group-hover:text-emerald-300 transition">${escapeHtml(plugin.name)}</h4>
                <div class="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <span class="truncate max-w-[120px]">by ${escapeHtml(plugin.author || 'Community')}</span>
                  <span>•</span>
                  <span class="text-slate-300 font-mono text-[11px]"><i class="fa-solid fa-download text-[10px] text-slate-500 mr-0.5"></i>${downloadsFormatted}</span>
                </div>
              </div>
            </div>
            ${sourceBadge}
          </div>

          <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            ${escapeHtml(plugin.description || 'Minecraft server plugin.')}
          </p>
        </div>

        <div class="pt-4 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <span class="text-[10px] font-mono text-slate-500 truncate">Dest: ${escapeHtml(state.pluginsTargetDir)}</span>
          <button class="install-plugin-btn px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95 transition whitespace-nowrap">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <span>Install</span>
          </button>
        </div>
      `;

      const installBtn = card.querySelector('.install-plugin-btn');
      installBtn.addEventListener('click', () => installPlugin(plugin, installBtn));

      el.pluginCardsGrid.appendChild(card);
    });
  }

  async function installPlugin(plugin, btn) {
    if (!state.sessionId) {
      showToast('Please connect to an SFTP/FTP server before installing plugins.', 'warning');
      switchView('files');
      return;
    }

    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.className = 'px-3.5 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow whitespace-nowrap cursor-wait';
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Installing...</span>`;

    showToast(`Downloading and installing ${plugin.name} to ${state.pluginsTargetDir}...`, 'info');

    try {
      const res = await api('/api/plugins/install', {
        method: 'POST',
        body: JSON.stringify({
          source: plugin.source,
          slug: plugin.slug || plugin.id,
          projectId: plugin.id,
          name: plugin.name,
          targetDir: state.pluginsTargetDir,
        }),
      });

      btn.className = 'px-3.5 py-2 rounded-xl bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow whitespace-nowrap';
      btn.innerHTML = `<i class="fa-solid fa-check"></i><span>Installed!</span>`;
      showToast(`Plugin '${res.plugin.name}' successfully installed to ${state.pluginsTargetDir}!`, 'success');

      // Refresh installed plugins in background
      loadInstalledPlugins(false);

      setTimeout(() => {
        btn.disabled = false;
        btn.className = 'install-plugin-btn px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95 transition whitespace-nowrap';
        btn.innerHTML = `<i class="fa-solid fa-rotate"></i><span>Reinstall</span>`;
      }, 4000);
    } catch (err) {
      btn.disabled = false;
      btn.className = 'install-plugin-btn px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow whitespace-nowrap';
      btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Retry</span>`;
      showToast('Install failed: ' + err.message, 'error');
    }
  }

  async function loadInstalledPlugins(showLoadingIndicator = true) {
    if (!state.sessionId) {
      el.installedPluginsList.innerHTML = '';
      el.noInstalledPlugins.classList.remove('hidden');
      el.installedSummaryBadge.textContent = '';
      if (el.installedLocationText) el.installedLocationText.textContent = `Directory: ${state.pluginsTargetDir} (Not Connected)`;
      return;
    }

    if (showLoadingIndicator) {
      el.installedLoading.classList.remove('hidden');
      el.noInstalledPlugins.classList.add('hidden');
      el.installedPluginsList.innerHTML = '';
    }

    try {
      const res = await api(`/api/plugins/installed?path=${encodeURIComponent(state.pluginsTargetDir)}`);

      if (res.detectedPath && res.detectedPath !== state.pluginsTargetDir) {
        state.pluginsTargetDir = res.detectedPath;
        if (el.pluginsTargetDirInput) el.pluginsTargetDirInput.value = res.detectedPath;
        localStorage.setItem('akm_plugins_target_dir', res.detectedPath);
      }

      state.installedPlugins = res.plugins || [];
      const count = state.installedPlugins.length;

      if (el.installedCountBadge) el.installedCountBadge.textContent = count;
      if (el.pluginsBadgeCount) {
        el.pluginsBadgeCount.textContent = count;
        if (count > 0) el.pluginsBadgeCount.classList.remove('hidden');
      }

      let totalBytes = 0;
      state.installedPlugins.forEach((p) => { totalBytes += (p.size || 0); });

      if (el.installedSummaryBadge) {
        el.installedSummaryBadge.textContent = `${count} plugins (${formatBytes(totalBytes)})`;
      }
      if (el.installedLocationText) {
        el.installedLocationText.textContent = `Directory: ${state.pluginsTargetDir}`;
      }

      renderInstalledPluginsList(state.installedPlugins);
    } catch (err) {
      showToast('Error scanning installed plugins: ' + err.message, 'error');
      el.noInstalledPlugins.classList.remove('hidden');
    } finally {
      el.installedLoading.classList.add('hidden');
    }
  }

  function renderInstalledPluginsList(plugins) {
    el.installedPluginsList.innerHTML = '';
    if (!plugins || plugins.length === 0) {
      el.noInstalledPlugins.classList.remove('hidden');
      return;
    }
    el.noInstalledPlugins.classList.add('hidden');

    plugins.forEach((plugin) => {
      const item = document.createElement('div');
      item.className = 'p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition';

      const fullFilePath = state.pluginsTargetDir === '/' ? `/${plugin.name}` : `${state.pluginsTargetDir}/${plugin.name}`;
      const modTime = plugin.modifyTime ? new Date(plugin.modifyTime).toLocaleDateString() : '';

      item.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-cube text-lg"></i>
          </div>
          <div class="min-w-0">
            <div class="font-mono font-semibold text-white text-xs sm:text-sm truncate">${escapeHtml(plugin.name)}</div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span class="font-mono text-emerald-400/90">${formatBytes(plugin.size || 0)}</span>
              ${modTime ? `<span>•</span><span>${modTime}</span>` : ''}
              <span>•</span>
              <span class="text-slate-500 font-mono truncate max-w-[120px] sm:max-w-xs">${escapeHtml(state.pluginsTargetDir)}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button class="dl-installed-btn p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition" title="Download .jar file">
            <i class="fa-solid fa-cloud-arrow-down text-xs"></i>
          </button>
          <button class="del-installed-btn p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition" title="Delete Plugin">
            <i class="fa-regular fa-trash-can text-xs"></i>
          </button>
        </div>
      `;

      item.querySelector('.dl-installed-btn').addEventListener('click', () => {
        downloadFile(fullFilePath, plugin.name);
      });

      item.querySelector('.del-installed-btn').addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to remove '${plugin.name}' from your server?`)) return;
        try {
          await api('/api/plugins/delete', {
            method: 'POST',
            body: JSON.stringify({ path: fullFilePath }),
          });
          showToast(`Deleted ${plugin.name} successfully`, 'success');
          loadInstalledPlugins();
        } catch (err) {
          showToast('Failed to delete plugin: ' + err.message, 'error');
        }
      });

      el.installedPluginsList.appendChild(item);
    });
  }

  // Set / Save Target Plugins Directory
  if (el.savePluginsTargetDirBtn) {
    el.savePluginsTargetDirBtn.addEventListener('click', () => {
      const p = el.pluginsTargetDirInput.value.trim();
      if (!p) return;
      state.pluginsTargetDir = p;
      localStorage.setItem('akm_plugins_target_dir', p);
      showToast(`Plugins directory set to: ${p}`, 'success');
      loadInstalledPlugins();
    });
  }

  if (el.pluginsTargetDirInput) {
    el.pluginsTargetDirInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        el.savePluginsTargetDirBtn.click();
      }
    });
  }

  // Preset Buttons
  document.querySelectorAll('.plugin-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.path;
      if (p) {
        state.pluginsTargetDir = p;
        if (el.pluginsTargetDirInput) el.pluginsTargetDirInput.value = p;
        localStorage.setItem('akm_plugins_target_dir', p);
        showToast(`Plugins directory set to: ${p}`, 'info');
        loadInstalledPlugins();
      }
    });
  });

  // Auto Detect Plugins Directory
  if (el.autoDetectPluginsDirBtn) {
    el.autoDetectPluginsDirBtn.addEventListener('click', async () => {
      if (!state.sessionId) {
        showToast('Please connect to your server first to auto-detect.', 'warning');
        return;
      }
      const origHtml = el.autoDetectPluginsDirBtn.innerHTML;
      el.autoDetectPluginsDirBtn.disabled = true;
      el.autoDetectPluginsDirBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-amber-400"></i> Detecting...`;

      try {
        const res = await api('/api/plugins/detect');
        state.pluginsTargetDir = res.path;
        if (el.pluginsTargetDirInput) el.pluginsTargetDirInput.value = res.path;
        localStorage.setItem('akm_plugins_target_dir', res.path);
        showToast(`Detected ${res.hosting} server! Plugins directory: ${res.path}`, 'success');
        loadInstalledPlugins();
      } catch (err) {
        showToast('Detection error: ' + err.message, 'error');
      } finally {
        el.autoDetectPluginsDirBtn.disabled = false;
        el.autoDetectPluginsDirBtn.innerHTML = origHtml;
      }
    });
  }

  // Search & Category Pill Listeners
  if (el.pluginSearchSubmitBtn) {
    el.pluginSearchSubmitBtn.addEventListener('click', () => {
      searchMinecraftPlugins(el.pluginSearchInput.value);
    });
  }

  if (el.pluginSearchInput) {
    el.pluginSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchMinecraftPlugins(el.pluginSearchInput.value);
      }
    });
  }

  if (el.pluginSourceSelect) {
    el.pluginSourceSelect.addEventListener('change', () => {
      searchMinecraftPlugins(el.pluginSearchInput.value);
    });
  }

  document.querySelectorAll('.cat-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (el.pluginSearchInput) el.pluginSearchInput.value = tag;
      searchMinecraftPlugins(tag);
    });
  });

  // Refresh & Upload Custom Plugins
  if (el.refreshPluginsBtn) {
    el.refreshPluginsBtn.addEventListener('click', () => {
      loadInstalledPlugins();
      showToast('Refreshed plugins list', 'info');
    });
  }

  if (el.pluginUploadInput) {
    el.pluginUploadInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      if (!state.sessionId) {
        showToast('Please connect to your server before uploading plugins.', 'warning');
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.endsWith('.jar')) {
          showToast(`Warning: ${file.name} does not appear to be a .jar plugin file`, 'warning');
        }

        showToast(`Uploading plugin ${file.name} to ${state.pluginsTargetDir}...`, 'info');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('remoteDir', state.pluginsTargetDir);

        try {
          await api('/api/sftp/upload', {
            method: 'POST',
            body: formData,
          });
          showToast(`Uploaded ${file.name} to plugins successfully!`, 'success');
        } catch (err) {
          showToast(`Upload failed for ${file.name}: ${err.message}`, 'error');
        }
      }

      e.target.value = '';
      loadInstalledPlugins();
    });
  }

  if (el.openPluginsInExplorerBtn) {
    el.openPluginsInExplorerBtn.addEventListener('click', () => {
      state.currentPath = state.pluginsTargetDir;
      switchView('files');
      loadDirectory(state.pluginsTargetDir);
    });
  }

  // --- AUTH TABS & SUBMISSIONS ---
  el.tabLoginBtn.addEventListener('click', () => {
    el.tabLoginBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-600 shadow transition-all';
    el.tabRegisterBtn.className = 'flex-1 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-all';
    el.loginForm.classList.remove('hidden');
    el.registerForm.classList.add('hidden');
  });

  el.tabRegisterBtn.addEventListener('click', () => {
    el.tabRegisterBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-600 shadow transition-all';
    el.tabLoginBtn.className = 'flex-1 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-all';
    el.registerForm.classList.remove('hidden');
    el.loginForm.classList.add('hidden');
  });

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = el.loginUsername.value.trim();
    const password = el.loginPassword.value;
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('akm_sftp_token', res.token);
      showToast(`Welcome back, ${res.user.username}!`, 'success');
      showApp();
      loadDefaultConfig();
      loadConnections();
      checkSessionStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  el.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = el.regUsername.value.trim();
    const email = el.regEmail.value.trim();
    const password = el.regPassword.value;
    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('akm_sftp_token', res.token);
      showToast(`Account created! Welcome, ${res.user.username}!`, 'success');
      showApp();
      loadDefaultConfig();
      loadConnections();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  el.logoutBtn.addEventListener('click', handleLogout);

  // Password visibility toggles
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
      } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
      }
    });
  });

  // --- QUICK CONNECT MODAL & ACTIONS ---
  document.querySelectorAll('.trigger-quick-connect').forEach((btn) => {
    btn.addEventListener('click', () => openModal(el.quickConnectModal));
  });
  el.quickConnectModalBtn.addEventListener('click', () => openModal(el.quickConnectModal));

  // Protocol selector events
  if (el.qcProtocol) {
    el.qcProtocol.addEventListener('change', () => {
      if (el.qcProtocol.value === 'ftp') {
        if (el.qcPort.value === '22') el.qcPort.value = '21';
      } else {
        if (el.qcPort.value === '21') el.qcPort.value = '22';
      }
    });
  }

  if (el.connProtocol) {
    el.connProtocol.addEventListener('change', () => {
      if (el.connProtocol.value === 'ftp') {
        if (el.connPort.value === '22') el.connPort.value = '21';
      } else {
        if (el.connPort.value === '21') el.connPort.value = '22';
      }
    });
  }

  el.qcSaveConnection.addEventListener('change', (e) => {
    if (e.target.checked) {
      el.qcNameGroup.classList.remove('hidden');
    } else {
      el.qcNameGroup.classList.add('hidden');
    }
  });

  el.quickConnectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const protocol = el.qcProtocol ? el.qcProtocol.value : (parseInt(el.qcPort.value, 10) === 21 ? 'ftp' : 'sftp');
    const host = el.qcHost.value.trim();
    const port = el.qcPort.value;
    const username = el.qcUsername.value.trim();
    const password = el.qcPassword.value;
    const default_path = el.qcPath.value.trim() || '/';
    const saveConnection = el.qcSaveConnection.checked;
    const name = el.qcName.value.trim() || host;

    showToast(`Connecting to remote ${protocol.toUpperCase()} server...`, 'info');
    closeModal(el.quickConnectModal);

    try {
      const res = await api('/api/sftp/connect', {
        method: 'POST',
        body: JSON.stringify({
          protocol,
          host,
          port,
          username,
          password,
          default_path,
          saveConnection,
          name,
        }),
      });

      state.sessionId = res.sessionId;
      state.sessionInfo = res.info;
      localStorage.setItem('akm_sftp_sessionId', res.sessionId);

      updateStatusBadge(true, res.info);
      showToast(`Connected to ${res.info.host}:${res.info.port}`, 'success');
      loadDirectory(res.info.initialPath || '/');
      if (saveConnection) loadConnections();
    } catch (err) {
      if (err.message && err.message.includes('Stored password could not be decrypted')) {
        const found = state.connections.find((c) => c.id === connectionId);
        if (found) {
          openEditConnectionModal(found);
          showToast('Please re-enter your password once and click Save Connection.', 'warning');
          return;
        }
      }
      showToast('Connection failed: ' + err.message, 'error');
    }
  });

  // Disconnect button
  async function disconnectActiveSession() {
    if (!state.sessionId) return;
    try {
      await api('/api/sftp/disconnect', { method: 'POST' });
      state.sessionId = null;
      state.sessionInfo = null;
      localStorage.removeItem('akm_sftp_sessionId');
      updateStatusBadge(false);
      showToast('Disconnected from SFTP server', 'info');
    } catch (err) {
      showToast('Disconnect error: ' + err.message, 'error');
    }
  }

  el.disconnectHeaderBtn.addEventListener('click', disconnectActiveSession);

  // --- SAVE / EDIT CONNECTION MODAL ---
  el.addNewConnectionBtn.addEventListener('click', openNewConnectionModal);
  el.vaultAddBtn.addEventListener('click', openNewConnectionModal);
  el.emptyAddBtn.addEventListener('click', openNewConnectionModal);

  el.testFormConnBtn.addEventListener('click', async () => {
    const protocol = el.connProtocol ? el.connProtocol.value : (parseInt(el.connPort.value, 10) === 21 ? 'ftp' : 'sftp');
    const host = el.connHost.value.trim();
    const port = el.connPort.value;
    const username = el.connUsername.value.trim();
    const password = el.connPassword.value;
    const connectionId = el.connEditId.value || undefined;

    if (!host || !username) {
      showToast('Please enter host and username to test', 'warning');
      return;
    }

    const orig = el.testFormConnBtn.innerHTML;
    el.testFormConnBtn.disabled = true;
    el.testFormConnBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-cyan-400"></i> Testing...`;

    try {
      const res = await api('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify({ protocol, host, port, username, password, connectionId }),
      });
      if (res.success) {
        showToast(`${(res.protocol || 'Server').toUpperCase()} reached! Latency: ${res.latencyMs}ms`, 'success');
      } else {
        showToast(`Connection test failed: ${res.error}`, 'error');
      }
    } catch (err) {
      showToast(`Test error: ${err.message}`, 'error');
    } finally {
      el.testFormConnBtn.disabled = false;
      el.testFormConnBtn.innerHTML = orig;
    }
  });

  el.connectionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = el.connEditId.value;
    const protocol = el.connProtocol ? el.connProtocol.value : (parseInt(el.connPort.value, 10) === 21 ? 'ftp' : 'sftp');
    const payload = {
      name: el.connName.value.trim(),
      host: el.connHost.value.trim(),
      port: el.connPort.value,
      username: el.connUsername.value.trim(),
      password: el.connPassword.value,
      auth_type: protocol,
      protocol: protocol,
      default_path: el.connDefaultPath.value.trim() || '/',
      plugins_path: (el.connPluginsPath ? el.connPluginsPath.value.trim() : '') || '/plugins',
    };

    try {
      if (editId) {
        await api(`/api/connections/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Connection profile updated', 'success');
      } else {
        await api('/api/connections', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Connection profile saved', 'success');
      }
      closeModal(el.connectionModal);
      loadConnections();
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
  });

  // --- NAVIGATION / DIRECTORY CONTROLS ---
  el.navUpBtn.addEventListener('click', () => {
    if (state.currentPath === '/' || !state.currentPath) return;
    const parts = state.currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    loadDirectory(parentPath);
  });

  el.navRefreshBtn.addEventListener('click', () => {
    loadDirectory(state.currentPath);
    showToast('Refreshed directory', 'info');
  });

  el.filterInput.addEventListener('input', (e) => {
    state.filterQuery = e.target.value;
    renderFileList();
  });

  el.directPathToggleBtn.addEventListener('click', () => {
    el.directPathBar.classList.toggle('hidden');
    if (!el.directPathBar.classList.contains('hidden')) {
      el.directPathInput.focus();
      el.directPathInput.select();
    }
  });

  el.directPathGoBtn.addEventListener('click', () => {
    const p = el.directPathInput.value.trim();
    if (p) loadDirectory(p);
  });

  el.directPathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const p = el.directPathInput.value.trim();
      if (p) loadDirectory(p);
    }
  });

  // --- NEW FILE & FOLDER ---
  el.newFileBtn.addEventListener('click', () => {
    el.newItemType.value = 'file';
    el.newItemTitle.textContent = 'Create New File';
    el.newItemLabel.textContent = 'File Name';
    el.newItemName.value = '';
    el.newItemName.placeholder = 'e.g. config.json, index.html';
    openModal(el.newItemModal);
    setTimeout(() => el.newItemName.focus(), 50);
  });

  el.newFolderBtn.addEventListener('click', () => {
    el.newItemType.value = 'folder';
    el.newItemTitle.textContent = 'Create New Folder';
    el.newItemLabel.textContent = 'Folder Name';
    el.newItemName.value = '';
    el.newItemName.placeholder = 'e.g. backup, logs, public';
    openModal(el.newItemModal);
    setTimeout(() => el.newItemName.focus(), 50);
  });

  el.newItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el.newItemName.value.trim();
    if (!name) return;

    const type = el.newItemType.value;
    const fullPath = state.currentPath === '/' ? `/${name}` : `${state.currentPath}/${name}`;
    closeModal(el.newItemModal);

    try {
      if (type === 'file') {
        await api('/api/sftp/create-file', {
          method: 'POST',
          body: JSON.stringify({ path: fullPath }),
        });
        showToast(`Created file ${name}`, 'success');
      } else {
        await api('/api/sftp/mkdir', {
          method: 'POST',
          body: JSON.stringify({ path: fullPath }),
        });
        showToast(`Created folder ${name}`, 'success');
      }
      loadDirectory(state.currentPath);
    } catch (err) {
      showToast('Creation failed: ' + err.message, 'error');
    }
  });

  // --- UPLOAD CONTROLS & DRAG DROP ---
  el.fileUploadInput.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropOverlay.classList.remove('hidden');
  });

  el.dropZone.addEventListener('dragleave', (e) => {
    if (!el.dropZone.contains(e.relatedTarget)) {
      el.dropOverlay.classList.add('hidden');
    }
  });

  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropOverlay.classList.add('hidden');
    if (e.dataTransfer && e.dataTransfer.files) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  // --- CODE EDITOR SAVE & SHORTCUT ---
  el.editorSaveBtn.addEventListener('click', saveFileEditor);
  el.editorContent.addEventListener('input', updateEditorStats);

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (!el.editorModal.classList.contains('hidden')) {
        e.preventDefault();
        saveFileEditor();
      }
    }
  });

  // --- RENAME SUBMIT ---
  el.renameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPath = el.renameOldPath.value;
    const newName = el.renameNewName.value.trim();
    if (!newName) return;

    const dir = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
    const newPath = dir === '/' ? `/${newName}` : `${dir}/${newName}`;
    closeModal(el.renameModal);

    try {
      await api('/api/sftp/rename', {
        method: 'POST',
        body: JSON.stringify({ oldPath, newPath }),
      });
      showToast('Renamed item successfully', 'success');
      loadDirectory(state.currentPath);
    } catch (err) {
      showToast('Rename failed: ' + err.message, 'error');
    }
  });

  // --- CHMOD FORM & EVENTS ---
  document.querySelectorAll('.chmod-box').forEach((box) => {
    box.addEventListener('change', syncChmodOctalFromBoxes);
  });

  el.chmodOctal.addEventListener('input', (e) => {
    syncChmodCheckboxes(e.target.value);
  });

  el.chmodForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const path = el.chmodTarget.value;
    const mode = el.chmodOctal.value.trim();
    closeModal(el.chmodModal);

    try {
      await api('/api/sftp/chmod', {
        method: 'POST',
        body: JSON.stringify({ path, mode }),
      });
      showToast(`Permissions updated to ${mode}`, 'success');
      loadDirectory(state.currentPath);
    } catch (err) {
      showToast('Chmod failed: ' + err.message, 'error');
    }
  });

  // --- DELETE CONFIRMATION ---
  el.confirmDeleteBtn.addEventListener('click', async () => {
    const path = el.deleteTargetPath.value;
    const isDir = el.deleteTargetIsDir.value === 'true';
    closeModal(el.deleteModal);

    try {
      await api('/api/sftp/delete', {
        method: 'POST',
        body: JSON.stringify({ path, isDirectory: isDir }),
      });
      showToast('Item deleted successfully', 'success');
      loadDirectory(state.currentPath);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  });

  // Initialize
  checkAuth();
})();
