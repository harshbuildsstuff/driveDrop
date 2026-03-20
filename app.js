(function () {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    const count = Math.floor((canvas.width * canvas.height) / 3500);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.2,
        o: Math.random() * 0.7 + 0.1,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.01 + Math.random() * 0.02,
        color: Math.random() > 0.85 ? '#7ec8ff' : Math.random() > 0.7 ? '#a5f3fc' : '#ffffff'
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.twinkle += s.twinkleSpeed;
      const alpha = s.o * (0.6 + 0.4 * Math.sin(s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      if (s.r > 1.1) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 2.5, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.5);
        g.addColorStop(0, 'rgba(126,200,255,0.15)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); initStars(); });
  resize();
  initStars();
  draw();
})();

const CLIENT_ID = '454687705679-4fnmgiq995h34t5rti2i93la2q2s4ejh.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive';
const DEFAULT_FOLDER_NAME = 'Drive Uploads Voice';

let accessToken = null;
let uploadFolderId = null;
let uploadFolderName = DEFAULT_FOLDER_NAME;
let uploadedCount = 0;
let totalBytes = 0;
let sessionMaxDrop = 0;

const ACHIEVEMENTS = [
  { id: 'first_contact', icon: '🛸', name: 'First Contact', desc: 'Upload your very first file', category: 'milestones', check: (s) => s.totalFiles >= 1 },
  { id: 'signal_established', icon: '📡', name: 'Signal Established', desc: 'Upload 10 files total', category: 'milestones', check: (s) => s.totalFiles >= 10 },
  { id: 'deep_space_carrier', icon: '🌌', name: 'Deep Space Carrier', desc: 'Upload 50 files total', category: 'milestones', check: (s) => s.totalFiles >= 50 },
  { id: 'interstellar_hauler', icon: '🚀', name: 'Interstellar Hauler', desc: 'Upload 100 files total', category: 'milestones', check: (s) => s.totalFiles >= 100 },
  { id: 'spark', icon: '⚡', name: 'Spark', desc: 'Transmit 100 MB total', category: 'data', check: (s) => s.totalBytes >= 100 * 1024 * 1024 },
  { id: 'comet', icon: '🌠', name: 'Comet', desc: 'Transmit 1 GB total', category: 'data', check: (s) => s.totalBytes >= 1024 * 1024 * 1024 },
  { id: 'planetary_mass', icon: '🪐', name: 'Planetary Mass', desc: 'Transmit 10 GB total', category: 'data', check: (s) => s.totalBytes >= 10 * 1024 * 1024 * 1024 },
  { id: 'stellar_core', icon: '☀️', name: 'Stellar Core', desc: 'Transmit 50 GB total', category: 'data', check: (s) => s.totalBytes >= 50 * 1024 * 1024 * 1024 },
  { id: 'night_shift', icon: '🌙', name: 'Night Shift', desc: 'Upload a file between midnight and 5 AM', category: 'fun', check: (s) => s.nightShift === true },
  { id: 'cargo_bay', icon: '🗂️', name: 'Cargo Bay Full', desc: 'Drop 3 or more files at once', category: 'fun', check: (s) => s.maxDrop >= 3 },
  { id: 'declutter', icon: '🧹', name: 'Declutter', desc: 'Upload 1 GB in a single day', category: 'fun', check: (s) => s.dailyBytes >= 1024 * 1024 * 1024 }
];

function loadStats() {
  try { return JSON.parse(localStorage.getItem('drivedrop_stats') || '{}'); }
  catch (e) { return {}; }
}

function saveStats(stats) {
  localStorage.setItem('drivedrop_stats', JSON.stringify(stats));
}

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem('drivedrop_unlocked') || '[]'); }
  catch (e) { return []; }
}

function saveUnlocked(list) {
  localStorage.setItem('drivedrop_unlocked', JSON.stringify(list));
}

let achievementQueue = [];
let achievementShowing = false;

function checkAchievements(stats) {
  const unlocked = loadUnlocked();
  ACHIEVEMENTS.forEach(a => {
    if (!unlocked.includes(a.id) && a.check(stats)) {
      unlocked.push(a.id);
      achievementQueue.push(a);
    }
  });
  saveUnlocked(unlocked);
  updateAchievementUI();
  if (!achievementShowing) drainAchievementQueue();
}

function drainAchievementQueue() {
  if (achievementQueue.length === 0) { achievementShowing = false; return; }
  achievementShowing = true;
  showAchievementOverlay(achievementQueue.shift());
}

function showAchievementOverlay(a) {
  document.getElementById('aubIcon').textContent = a.icon;
  document.getElementById('aubName').textContent = a.name;
  document.getElementById('aubDesc').textContent = a.desc;
  document.getElementById('achievementOverlay').classList.add('open');
}

function closeAchievementOverlay() {
  document.getElementById('achievementOverlay').classList.remove('open');
  setTimeout(drainAchievementQueue, 400);
}

function updateAchievementUI() {
  const unlocked = loadUnlocked();
  const total = ACHIEVEMENTS.length;
  const count = unlocked.length;
  document.getElementById('achProgressPill').textContent = `${count} / ${total} Unlocked`;
  document.getElementById('achProgressBar').style.width = (count / total * 100) + '%';
  const badge = document.getElementById('achievementBadge');
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  renderAchievementGrid('achGridMilestones', 'milestones', unlocked);
  renderAchievementGrid('achGridData', 'data', unlocked);
  renderAchievementGrid('achGridFun', 'fun', unlocked);
}

function renderAchievementGrid(gridId, category, unlocked) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  ACHIEVEMENTS.filter(a => a.category === category).forEach(a => {
    const isUnlocked = unlocked.includes(a.id);
    const card = document.createElement('div');
    card.className = 'ach-card panel ' + (isUnlocked ? 'unlocked' : 'locked');
    card.innerHTML = `
      <div class="ach-card-icon">${a.icon}</div>
      <div class="ach-card-name">${a.name}</div>
      <div class="ach-card-desc">${a.desc}</div>
      <div class="ach-card-status">${isUnlocked ? '✓ Unlocked' : 'Locked'}</div>`;
    grid.appendChild(card);
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  if (tab === 'dashboard') {
    document.getElementById('tabDashboard').classList.remove('hidden');
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
  } else {
    document.getElementById('tabAchievements').classList.remove('hidden');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    updateAchievementUI();
  }
}
function handleAuth() {
  if (accessToken) {
    signOut();
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) {
        showToast('AUTH FAILED: ' + resp.error, 'error');
        return;
      }
      accessToken = resp.access_token;
      setSignedIn(true);
      await loadDriveInfo();
      await ensureDefaultFolder();
    }
  });
  client.requestAccessToken();
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  uploadFolderId = null;
  setSignedIn(false);
  document.getElementById('infoUsed').textContent = '—';
  document.getElementById('infoFree').textContent = '—';
  document.getElementById('storageText').textContent = 'Awaiting connection…';
  document.getElementById('storageBar').style.width = '0%';
  document.getElementById('folderName').textContent = 'Connect to assign folder';
}

function setSignedIn(yes) {
  const btn = document.getElementById('authBtn');
  const zone = document.getElementById('dropzone');
  if (yes) {
    btn.textContent = 'Disconnect';
    btn.classList.add('signed-in');
    zone.classList.remove('disabled');
  } else {
    btn.textContent = 'Connect';
    btn.classList.remove('signed-in');
    zone.classList.add('disabled');
  }
}

async function loadDriveInfo() {
  try {
    const r = await gFetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota');
    const q = r.storageQuota;
    const used = parseInt(q.usageInDrive || q.usage || 0);
    const total = parseInt(q.limit || 0);
    const free = Math.max(0, total - used);
    const pct = total > 0 ? (used / total * 100) : 0;

    document.getElementById('infoUsed').textContent = formatBytes(used);
    document.getElementById('infoFree').textContent = formatBytes(free);
    document.getElementById('storageText').textContent = `${formatBytes(used)} of ${formatBytes(total)} used — ${pct.toFixed(1)}%`;

    const bar = document.getElementById('storageBar');
    bar.style.width = pct + '%';
    bar.className = 'storage-bar-fill' + (pct > 90 ? ' crit' : pct > 70 ? ' warn' : '');
    document.getElementById('infoFree').className = 'info-value ' + (pct > 90 ? 'warn' : 'green');
  } catch (e) {
    document.getElementById('storageText').textContent = 'Failed to load storage data';
  }
}

async function ensureDefaultFolder() {
  try {
    const res = await gFetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(DEFAULT_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`
    );
    if (res.files && res.files.length > 0) {
      uploadFolderId = res.files[0].id;
      uploadFolderName = res.files[0].name;
    } else {
      uploadFolderId = await createFolder(DEFAULT_FOLDER_NAME);
      uploadFolderName = DEFAULT_FOLDER_NAME;
      showToast('📡 Sector "' + DEFAULT_FOLDER_NAME + '" created', 'success');
    }
    document.getElementById('folderName').textContent = uploadFolderName;
  } catch (e) {
    showToast('Could not set up folder', 'error');
  }
}

async function createFolder(name) {
  const res = await gFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
  });
  return res.id;
}

async function openFolderModal() {
  if (!accessToken) {
    showToast('Connect first', 'error');
    return;
  }
  document.getElementById('folderModal').classList.add('open');
  document.getElementById('newFolderInput').value = '';
  await loadFolderList();
}

function closeFolderModal() {
  document.getElementById('folderModal').classList.remove('open');
}

function closeFolderModalOutside(e) {
  if (e.target === document.getElementById('folderModal')) closeFolderModal();
}

async function loadFolderList() {
  const listEl = document.getElementById('folderList');
  listEl.innerHTML = '<div class="folder-list-placeholder">Scanning sectors…</div>';
  try {
    const res = await gFetch(
      `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&orderBy=name&fields=files(id,name)&pageSize=50`
    );
    listEl.innerHTML = '';
    if (!res.files || !res.files.length) {
      listEl.innerHTML = '<div class="folder-list-placeholder">No sectors found</div>';
      return;
    }
    res.files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'folder-item' + (f.id === uploadFolderId ? ' selected' : '');
      item.innerHTML = `<span>📁</span><span>${f.name}</span>`;
      item.onclick = () => selectFolder(f.id, f.name);
      listEl.appendChild(item);
    });
  } catch (e) {
    listEl.innerHTML = '<div class="folder-list-placeholder" style="color:var(--error)">Scan failed</div>';
  }
}

function selectFolder(id, name) {
  uploadFolderId = id;
  uploadFolderName = name;
  document.getElementById('folderName').textContent = name;
  showToast('📡 Rerouted to "' + name + '"', 'success');
  closeFolderModal();
}

async function createAndSelectFolder() {
  const name = document.getElementById('newFolderInput').value.trim();
  if (!name) {
    showToast('Enter a sector name', 'error');
    return;
  }
  try {
    const id = await createFolder(name);
    selectFolder(id, name);
  } catch (e) {
    showToast('Sector creation failed', 'error');
  }
}

function onDragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('drag-over');
}

function onDragLeave() {
  document.getElementById('dropzone').classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  handleFiles([...e.dataTransfer.files]);
}

function onFileSelect(e) {
  handleFiles([...e.target.files]);
  e.target.value = '';
}

function handleFiles(files) {
  if (!accessToken) { showToast('Connect first', 'error'); return; }
  if (!uploadFolderId) { showToast('Folder not ready yet…', 'error'); return; }
  if (!files.length) return;
  if (files.length > sessionMaxDrop) sessionMaxDrop = files.length;

  document.getElementById('queueWrapper').classList.remove('hidden');
  files.forEach(file => {
    totalBytes += file.size;
    updateStats();
    const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
    addFileCard(id, file);
    uploadFile(file, id);
  });
}

function addFileCard(id, file) {
  const ext = file.name.split('.').pop().toUpperCase().slice(0, 5) || 'FILE';
  const card = document.createElement('div');
  card.className = 'file-card panel';
  card.id = id;
  card.innerHTML = `
    <div class="file-type-badge">${ext}</div>
    <div class="file-info">
      <div class="file-name">${file.name}</div>
      <div class="file-size">${formatBytes(file.size)}</div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" id="bar-${id}"></div></div>
    </div>
    <div class="file-status pending" id="st-${id}">…</div>`;
  document.getElementById('fileList').prepend(card);
  updateStats();
}

function uploadFile(file, cardId) {
  const stEl = document.getElementById('st-' + cardId);
  const barEl = document.getElementById('bar-' + cardId);
  stEl.textContent = 'TX';
  stEl.className = 'file-status uploading';

function recordUpload(fileSize) {
  const stats = loadStats();
  stats.totalFiles = (stats.totalFiles || 0) + 1;
  stats.totalBytes = (stats.totalBytes || 0) + fileSize;
  stats.maxDrop = Math.max(stats.maxDrop || 0, sessionMaxDrop);
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) stats.nightShift = true;
  const today = new Date().toDateString();
  if (stats.dailyDate !== today) { stats.dailyDate = today; stats.dailyBytes = 0; }
  stats.dailyBytes = (stats.dailyBytes || 0) + fileSize;
  saveStats(stats);
  checkAchievements(stats);
}

  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [uploadFolderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
  xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) barEl.style.width = Math.round(e.loaded / e.total * 100) + '%';
  };

  xhr.onload = () => {
    if (xhr.status === 200 || xhr.status === 201) {
      stEl.textContent = 'RX ✓';
      stEl.className = 'file-status done';
      barEl.style.width = '100%';
      uploadedCount++;
      recordUpload(file.size);
      updateStats();
      showToast('✓ Beamed: ' + file.name, 'success');
      loadDriveInfo();
    } else {
      stEl.textContent = 'ERR';
      stEl.className = 'file-status error';
      showToast('TX Failed: ' + file.name, 'error');
    }
  };

  xhr.onerror = () => {
    stEl.textContent = 'ERR';
    stEl.className = 'file-status error';
    showToast('Signal lost', 'error');
  };

  xhr.send(form);
}

async function gFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + accessToken, ...(opts.headers || {}) }
  });
  return res.json();
}

function updateStats() {
  document.getElementById('statQueued').textContent = document.getElementById('fileList').children.length;
  document.getElementById('statDone').textContent = uploadedCount;
  document.getElementById('statSize').textContent = formatBytes(totalBytes);
}

function formatBytes(b) {
  b = parseInt(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}


let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 3500);
}

function acceptCookies() {
  localStorage.setItem('cookiesAccepted', 'true');
  document.getElementById('cookieBar').classList.remove('visible');
}

function declineCookies() {
  document.getElementById('cookieBar').classList.remove('visible');
}

function initCookieBanner() {
  if (!localStorage.getItem('cookiesAccepted')) {
    setTimeout(() => {
      document.getElementById('cookieBar').classList.add('visible');
    }, 1200);
  }
}
updateAchievementUI();
initCookieBanner();

window.addEventListener('load', () => {
  if (localStorage.getItem('cookiesAccepted')) {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      prompt: '',
      callback: async (resp) => {
        if (resp.error) return;
        accessToken = resp.access_token;
        setSignedIn(true);
        await loadDriveInfo();
        await ensureDefaultFolder();
      }
    });
    client.requestAccessToken();
  }
});
