// ===== 全局状态 =====
const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  currentPage: 'generate',
  tasks: [],
  taskTotal: 0,
  taskPage: 1,
  taskPageSize: 15,
  allTasks: [],
  allTaskTotal: 0,
  allTaskPage: 1,
  users: [],
  settings: {},
  stats: {},
  globalStats: {},
  uploadFiles: [],
  generating: false,
  generateType: 'text-to-image',
  systemName: 'AI图片处理系统',
  authorized: true,  // 默认已授权，后续检查会更新
  licenseInfo: null
};

// ===== 授权检查 =====
async function checkLicense() {
  try {
    const res = await fetch('/api/license/status');
    const data = await res.json();
    state.authorized = data.authorized;
    state.licenseInfo = data;
    return data;
  } catch (err) {
    console.error('授权检查失败:', err);
    state.authorized = false;
    return { authorized: false, message: '授权检查失败' };
  }
}

async function activateLicense(licenseKey) {
  const res = await fetch('/api/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '激活失败');
  return data;
}

// 显示授权弹窗
function showLicenseModal() {
  const machineId = state.licenseInfo?.machineId || '未知';

  // 如果已存在弹窗则不重复创建
  if (document.getElementById('license-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'license-modal';
  modal.className = 'license-modal-overlay';
  modal.innerHTML = `
    <div class="license-modal">
      <div class="license-icon">🔒</div>
      <h2>系统授权验证</h2>
      <p class="license-desc">本系统需要授权才能使用，请联系管理员获取授权码</p>
      <div class="license-machine-id">
        <label>机器ID</label>
        <div class="machine-id-box">
          <code id="machine-id-text">${machineId}</code>
          <button class="btn-copy-id" onclick="copyMachineId()" title="复制">复制</button>
        </div>
      </div>
      <div class="license-input-group">
        <label>授权码</label>
        <input type="text" id="license-key-input" placeholder="请输入授权码" autocomplete="off">
      </div>
      <div id="license-error" class="license-error"></div>
      <button class="btn btn-primary license-activate-btn" id="license-activate">激活授权</button>
      <p class="license-hint">请将机器ID发送给管理员，获取对应的授权码后输入激活</p>
    </div>
  `;
  document.body.appendChild(modal);

  // 绑定激活按钮
  document.getElementById('license-activate').addEventListener('click', async () => {
    const key = document.getElementById('license-key-input').value.trim();
    const errEl = document.getElementById('license-error');
    if (!key) {
      errEl.textContent = '请输入授权码';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('license-activate');
    btn.disabled = true;
    btn.textContent = '激活中...';

    try {
      const result = await activateLicense(key);
      state.authorized = true;
      state.licenseInfo = {
        authorized: true,
        type: result.type,
        typeName: result.typeName,
        expireDate: result.expireDate,
        message: result.message
      };
      modal.remove();
      showToast('授权激活成功！' + result.message, 'success');
      render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '激活授权';
    }
  });

  // 回车提交
  document.getElementById('license-key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('license-activate').click();
  });
}

function copyMachineId() {
  const text = document.getElementById('machine-id-text')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('机器ID已复制', 'success');
    }).catch(() => {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('机器ID已复制', 'success');
    });
  }
}

// 加载公开设置（系统名称等）
async function loadPublicSettings() {
  try {
    const data = await api('GET', '/settings/public');
    if (data.system_name) {
      state.systemName = data.system_name;
      document.title = state.systemName;
    }
  } catch (e) { /* 忽略 */ }
}

// ===== API 工具 =====
async function api(method, url, data, isFormData = false) {
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const options = { method, headers };
  if (data) options.body = isFormData ? data : JSON.stringify(data);

  let res;
  try {
    res = await fetch(`/api${url}`, options);
  } catch (err) {
    throw new Error('网络请求失败: ' + err.message);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error('响应解析失败(HTTP ' + res.status + ')');
  }

  if (!res.ok) {
    throw new Error(json.error || '请求失败');
  }
  return json;
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
}

// ===== 路由 =====
function navigate(page) {
  state.currentPage = page;
  render();
}

// ===== 主渲染 =====
function render() {
  const app = document.getElementById('app');

  // 未授权时只显示登录/注册页面，但弹出授权弹窗
  if (!state.authorized) {
    app.innerHTML = renderAuth();
    bindAuthEvents();
    showLicenseModal();
    return;
  }

  if (!state.token || !state.user) {
    app.innerHTML = renderAuth();
    bindAuthEvents();
  } else {
    app.innerHTML = renderLayout();
    bindLayoutEvents();
    renderPage();
  }
}

// ===== 认证页面 =====
function renderAuth() {
  return `
    <div class="auth-container">
      <div class="auth-card">
        <h1>${state.systemName}</h1>
        <p class="subtitle">智能图片生成平台</p>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">登录</button>
          <button class="auth-tab" data-tab="register">注册</button>
        </div>
        <div id="auth-form">
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="auth-username" placeholder="请输入用户名" autocomplete="username">
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="auth-password" placeholder="请输入密码" autocomplete="current-password">
          </div>
          <div id="register-fields" style="display:none">
            <div class="form-group">
              <label>确认密码</label>
              <input type="password" id="auth-confirm-password" placeholder="请再次输入密码">
            </div>
          </div>
          <div id="auth-error" class="error-msg"></div>
          <button class="btn btn-primary" id="auth-submit">登录</button>
        </div>
      </div>
    </div>
  `;
}

function bindAuthEvents() {
  let mode = 'login';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      mode = tab.dataset.tab;
      document.getElementById('register-fields').style.display = mode === 'register' ? 'block' : 'none';
      document.getElementById('auth-submit').textContent = mode === 'login' ? '登录' : '注册';
      document.getElementById('auth-error').classList.remove('show');
    });
  });

  document.getElementById('auth-submit').addEventListener('click', async () => {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');

    if (!username || !password) {
      errEl.textContent = '请输入用户名和密码';
      errEl.classList.add('show');
      return;
    }

    if (mode === 'register') {
      const confirm = document.getElementById('auth-confirm-password').value;
      if (password !== confirm) {
        errEl.textContent = '两次密码不一致';
        errEl.classList.add('show');
        return;
      }
    }

    try {
      const res = await api('POST', `/auth/${mode}`, { username, password });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      showToast(mode === 'login' ? '登录成功' : '注册成功', 'success');
      loadPublicSettings();
      render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });

  // 回车提交
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-submit').click();
  });
}

// ===== 主布局 =====
function renderLayout() {
  const isAdmin = state.user.role === 'admin';
  return `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <h2>${state.systemName} <span class="role-badge">${isAdmin ? '管理员' : '用户'}</span></h2>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item ${state.currentPage === 'generate' ? 'active' : ''}" data-page="generate">
            <span class="icon">🎨</span> 图片生成
          </button>
          <button class="nav-item ${state.currentPage === 'tasks' ? 'active' : ''}" data-page="tasks">
            <span class="icon">📋</span> 我的任务
          </button>
          <button class="nav-item ${state.currentPage === 'stats' ? 'active' : ''}" data-page="stats">
            <span class="icon">📊</span> 使用统计
          </button>
          ${isAdmin ? `
          <button class="nav-item ${state.currentPage === 'all-tasks' ? 'active' : ''}" data-page="all-tasks">
            <span class="icon">📁</span> 全部任务
          </button>
          <button class="nav-item ${state.currentPage === 'users' ? 'active' : ''}" data-page="users">
            <span class="icon">👥</span> 用户管理
          </button>
          <button class="nav-item ${state.currentPage === 'settings' ? 'active' : ''}" data-page="settings">
            <span class="icon">⚙️</span> 系统设置
          </button>
          ` : ''}
          <button class="nav-item ${state.currentPage === 'profile' ? 'active' : ''}" data-page="profile">
            <span class="icon">👤</span> 个人设置
          </button>
        </nav>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${state.user.username[0].toUpperCase()}</div>
            <div>
              <div class="user-name">${state.user.username}</div>
              <div class="user-role">${isAdmin ? '管理员' : '普通用户'}</div>
            </div>
          </div>
          <button class="nav-item" id="logout-btn" style="color:rgba(255,255,255,0.6)">
            <span class="icon">🚪</span> 退出登录
          </button>
        </div>
      </aside>
      <main class="main-content" id="page-content"></main>
    </div>
  `;
}

function bindLayoutEvents() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    state.token = '';
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showToast('已退出登录', 'info');
    render();
  });
}

// ===== 页面渲染 =====
function renderPage() {
  const content = document.getElementById('page-content');
  switch (state.currentPage) {
    case 'generate': renderGenerate(content); break;
    case 'tasks': renderTasks(content); break;
    case 'stats': renderStats(content); break;
    case 'all-tasks': renderAllTasks(content); break;
    case 'users': renderUsers(content); break;
    case 'settings': renderSettings(content); break;
    case 'profile': renderProfile(content); break;
  }
}

// ===== 图片生成页面 =====
function renderGenerate(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>图片生成</h1>
      <p>使用文生图或图生图生成您想要的图片</p>
    </div>
    <div class="generate-container">
      <div class="generate-form">
        <div class="type-switch">
          <button class="type-switch-btn ${state.generateType === 'text-to-image' ? 'active' : ''}" data-type="text-to-image">✨ 文生图</button>
          <button class="type-switch-btn ${state.generateType === 'image-to-image' ? 'active' : ''}" data-type="image-to-image">🖼️ 图生图</button>
        </div>

        <div class="form-group">
          <label>提示词 *</label>
          <textarea id="gen-prompt" rows="4" placeholder="描述你想生成的图片内容，越详细效果越好..."></textarea>
        </div>

        <div id="image-upload-section" style="display:${state.generateType === 'image-to-image' ? 'block' : 'none'}">
          <div class="form-group">
            <label>参考图片 * (最多14张)</label>
            <div class="upload-area" id="upload-area">
              <div class="upload-icon">📤</div>
              <p>点击或拖拽上传图片</p>
              <input type="file" id="file-input" multiple accept="image/*" style="display:none">
            </div>
            <div class="upload-preview-grid" id="upload-preview"></div>
          </div>
        </div>

        <div class="option-row">
          <div class="form-group">
            <label>画面比例</label>
            <select id="gen-aspect">
              <option value="1:1" ${state.settings.default_aspect_ratio === '1:1' ? 'selected' : ''}>1:1 正方形</option>
              <option value="16:9" ${state.settings.default_aspect_ratio === '16:9' ? 'selected' : ''}>16:9 宽屏</option>
              <option value="9:16" ${state.settings.default_aspect_ratio === '9:16' ? 'selected' : ''}>9:16 竖屏</option>
              <option value="4:3" ${state.settings.default_aspect_ratio === '4:3' ? 'selected' : ''}>4:3 标准</option>
              <option value="3:4" ${state.settings.default_aspect_ratio === '3:4' ? 'selected' : ''}>3:4 竖版</option>
              <option value="3:2" ${state.settings.default_aspect_ratio === '3:2' ? 'selected' : ''}>3:2 横版</option>
              <option value="2:3" ${state.settings.default_aspect_ratio === '2:3' ? 'selected' : ''}>2:3 竖版</option>
              <option value="4:5" ${state.settings.default_aspect_ratio === '4:5' ? 'selected' : ''}>4:5</option>
              <option value="5:4" ${state.settings.default_aspect_ratio === '5:4' ? 'selected' : ''}>5:4</option>
              <option value="21:9" ${state.settings.default_aspect_ratio === '21:9' ? 'selected' : ''}>21:9 超宽</option>
              <option value="1:4" ${state.settings.default_aspect_ratio === '1:4' ? 'selected' : ''}>1:4 长条</option>
              <option value="4:1" ${state.settings.default_aspect_ratio === '4:1' ? 'selected' : ''}>4:1 横条</option>
              <option value="1:8" ${state.settings.default_aspect_ratio === '1:8' ? 'selected' : ''}>1:8 极窄</option>
              <option value="8:1" ${state.settings.default_aspect_ratio === '8:1' ? 'selected' : ''}>8:1 极宽</option>
            </select>
          </div>
          <div class="form-group">
            <label>画质</label>
            <select id="gen-resolution">
              <option value="0.5k" ${state.settings.default_resolution === '0.5k' ? 'selected' : ''}>0.5K 快速预览</option>
              <option value="1k" ${state.settings.default_resolution === '1k' ? 'selected' : ''}>1K 标准</option>
              <option value="2k" ${state.settings.default_resolution === '2k' ? 'selected' : ''}>2K 高清</option>
              <option value="4k" ${state.settings.default_resolution === '4k' ? 'selected' : ''}>4K 超高清</option>
            </select>
          </div>
        </div>

        <div class="option-row">
          <div class="form-group">
            <label>输出格式</label>
            <select id="gen-format">
              <option value="png" ${state.settings.default_output_format === 'png' ? 'selected' : ''}>PNG</option>
              <option value="jpeg" ${state.settings.default_output_format === 'jpeg' ? 'selected' : ''}>JPEG</option>
            </select>
          </div>
          <div class="form-group">
            <label>联网搜索</label>
            <select id="gen-web-search">
              <option value="false">关闭</option>
              <option value="true">开启</option>
            </select>
          </div>
        </div>

        <button class="btn btn-primary" id="gen-submit" ${state.generating ? 'disabled' : ''}>
          ${state.generating ? '⏳ 生成中...' : '🚀 开始生成'}
        </button>
      </div>

      <div class="generate-preview">
        <h3 style="margin-bottom:16px;font-weight:700">生成结果</h3>
        <div class="result-area ${state.generating ? '' : 'empty'}" id="result-area">
          ${state.generating ? `
            <div class="loading-overlay">
              <div class="loading-spinner"></div>
              <p>图片生成中，请稍候...</p>
            </div>
          ` : `
            <div class="result-icon">🖼️</div>
            <p>生成的图片将在这里显示</p>
          `}
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  container.querySelectorAll('.type-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.generateType = btn.dataset.type;
      renderGenerate(container);
    });
  });

  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
  }

  // 渲染已上传预览
  renderUploadPreview();

  document.getElementById('gen-submit').addEventListener('click', handleGenerate);
}

function handleFiles(files) {
  for (const f of files) {
    if (state.uploadFiles.length >= 14) break;
    if (f.type.startsWith('image/')) {
      state.uploadFiles.push(f);
    }
  }
  renderUploadPreview();
}

function renderUploadPreview() {
  const preview = document.getElementById('upload-preview');
  if (!preview) return;
  preview.innerHTML = state.uploadFiles.map((f, i) => `
    <div class="upload-preview-item">
      <img src="${URL.createObjectURL(f)}" alt="">
      <button class="remove-btn" data-index="${i}">×</button>
    </div>
  `).join('');
  preview.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.uploadFiles.splice(parseInt(btn.dataset.index), 1);
      renderUploadPreview();
    });
  });
}

async function handleGenerate() {
  const prompt = document.getElementById('gen-prompt').value.trim();
  if (!prompt) { showToast('请输入提示词', 'warning'); return; }

  if (state.generateType === 'image-to-image' && state.uploadFiles.length === 0) {
    showToast('请上传参考图片', 'warning');
    return;
  }

  // 在重新渲染前先读取所有参数值，避免渲染后select被重置
  const params = {
    aspect_ratio: document.getElementById('gen-aspect').value,
    resolution: document.getElementById('gen-resolution').value,
    output_format: document.getElementById('gen-format').value,
    enable_web_search: document.getElementById('gen-web-search').value === 'true'
  };

  state.generating = true;
  renderGenerate(document.getElementById('page-content'));

  try {
    if (state.generateType === 'text-to-image') {
      const res = await api('POST', '/tasks/text-to-image', {
        prompt,
        ...params
      });
      showToast('任务已提交，正在生成...', 'info');
      pollTaskStatus(res.taskId);
    } else {
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('aspect_ratio', params.aspect_ratio);
      formData.append('resolution', params.resolution);
      formData.append('output_format', params.output_format);
      formData.append('enable_web_search', params.enable_web_search);
      state.uploadFiles.forEach(f => formData.append('images', f));

      const res = await api('POST', '/tasks/image-to-image', formData, true);
      showToast('任务已提交，正在生成...', 'info');
      pollTaskStatus(res.taskId);
    }
  } catch (err) {
    state.generating = false;
    showToast(err.message, 'error');
    renderGenerate(document.getElementById('page-content'));
  }
}

async function pollTaskStatus(taskId) {
  const maxAttempts = 80;
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      state.generating = false;
      showToast('生成超时，请在任务列表中查看', 'warning');
      renderGenerate(document.getElementById('page-content'));
      return;
    }

    try {
      const task = await api('POST', `/tasks/${taskId}/check`);
      if (task.status === 'completed') {
        clearInterval(interval);
        state.generating = false;
        showToast('图片生成成功！', 'success');
        showResult(task);
      } else if (task.status === 'failed') {
        clearInterval(interval);
        state.generating = false;
        showToast('生成失败: ' + (task.error || '未知错误'), 'error');
        renderGenerate(document.getElementById('page-content'));
      }
    } catch (err) {
      // 继续轮询
    }
  }, 3000);
}

function showResult(task) {
  const resultArea = document.getElementById('result-area');
  if (!resultArea) return;

  let images = [];
  try { images = JSON.parse(task.output_images || '[]'); } catch {}

  if (images.length === 0) {
    resultArea.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>未获取到图片</p></div>`;
    return;
  }

  resultArea.className = 'result-area';
  resultArea.innerHTML = `
    <div class="result-images">
      ${images.map(url => `
        <div class="result-image-item">
          <img src="${url}" alt="生成结果" onclick="viewImage('${url}')">
          <a class="download-btn" href="${url}" download target="_blank">下载</a>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:16px;text-align:center">
      <button class="btn btn-ghost btn-sm" onclick="state.generating=false;renderGenerate(document.getElementById('page-content'))">继续生成</button>
    </div>
  `;
}

function viewImage(url) {
  const viewer = document.createElement('div');
  viewer.className = 'image-viewer';
  viewer.innerHTML = `<img src="${url}" alt="">`;
  viewer.addEventListener('click', () => viewer.remove());
  document.body.appendChild(viewer);
}

// ===== 我的任务页面 =====
async function renderTasks(container) {
  container.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><p>加载中...</p></div>`;

  try {
    const res = await api('GET', `/tasks?page=${state.taskPage}&pageSize=${state.taskPageSize}`);
    state.tasks = res.tasks || [];
    state.taskTotal = res.total || 0;
  } catch (err) {
    showToast('加载任务列表失败', 'error');
    state.tasks = [];
  }

  const totalPages = Math.ceil(state.taskTotal / state.taskPageSize);

  container.innerHTML = `
    <div class="page-header">
      <h1>我的任务</h1>
      <p>查看和管理您的图片生成任务</p>
    </div>
    <div class="task-filters">
      <select id="filter-status">
        <option value="">全部状态</option>
        <option value="pending">等待中</option>
        <option value="processing">处理中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
        <option value="timeout">异常</option>
      </select>
      <select id="filter-type">
        <option value="">全部类型</option>
        <option value="text-to-image">文生图</option>
        <option value="image-to-image">图生图</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="refresh-tasks">刷新</button>
    </div>
    ${state.tasks.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>暂无任务</h3>
        <p>去生成页面创建您的第一个任务吧</p>
      </div>
    ` : `
      <div class="card" style="padding:0;overflow-x:auto">
        <table class="task-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>预览</th>
              <th>类型</th>
              <th>提示词</th>
              <th>画面比例</th>
              <th>画质</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${state.tasks.map(t => {
              let outputImages = [];
              try { outputImages = JSON.parse(t.output_images || '[]'); } catch {}
              const thumb = outputImages.length > 0 ? outputImages[0] : null;
              return `
              <tr>
                <td>#${t.id}</td>
                <td>${thumb ? `<img src="${thumb}" class="task-thumb" onclick="viewImage('${thumb}')">` : '<span style="color:var(--dark-light);font-size:12px">无</span>'}</td>
                <td><span class="type-badge ${t.type}">${t.type === 'text-to-image' ? '文生图' : '图生图'}</span></td>
                <td><div class="prompt-preview">${escapeHtml(t.prompt)}</div></td>
                <td>${t.aspect_ratio}</td>
                <td>${t.resolution.toUpperCase()}</td>
                <td><span class="status-badge ${t.status}">${statusText(t.status)}</span></td>
                <td>${formatDate(t.created_at)}</td>
                <td class="task-actions">
                  <button class="btn btn-sm btn-ghost view-task-btn" data-id="${t.id}">查看</button>
                  ${outputImages.length > 0 ? `<button class="btn btn-sm btn-primary download-task-btn" data-id="${t.id}">下载</button>` : ''}
                  <button class="btn btn-sm btn-secondary regen-task-btn" data-id="${t.id}">重新生成</button>
                  <button class="btn btn-sm btn-danger delete-task-btn" data-id="${t.id}">删除</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button ${state.taskPage <= 1 ? 'disabled' : ''} id="prev-page">上一页</button>
        <span style="padding:8px 12px;font-size:13px;color:var(--dark-light)">${state.taskPage} / ${totalPages || 1}</span>
        <button ${state.taskPage >= totalPages ? 'disabled' : ''} id="next-page">下一页</button>
      </div>
    `}
  `;

  // 绑定事件
  document.getElementById('refresh-tasks')?.addEventListener('click', () => renderTasks(container));
  document.getElementById('prev-page')?.addEventListener('click', () => { state.taskPage--; renderTasks(container); });
  document.getElementById('next-page')?.addEventListener('click', () => { state.taskPage++; renderTasks(container); });

  document.getElementById('filter-status')?.addEventListener('change', async (e) => {
    const type = document.getElementById('filter-type').value;
    const res = await api('GET', `/tasks?page=1&pageSize=${state.taskPageSize}&status=${e.target.value}&type=${type}`);
    state.tasks = res.tasks || [];
    state.taskTotal = res.total || 0;
    state.taskPage = 1;
    renderTasks(container);
  });

  document.getElementById('filter-type')?.addEventListener('change', async (e) => {
    const status = document.getElementById('filter-status').value;
    const res = await api('GET', `/tasks?page=1&pageSize=${state.taskPageSize}&status=${status}&type=${e.target.value}`);
    state.tasks = res.tasks || [];
    state.taskTotal = res.total || 0;
    state.taskPage = 1;
    renderTasks(container);
  });

  container.querySelectorAll('.view-task-btn').forEach(btn => {
    btn.addEventListener('click', () => showTaskDetail(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.download-task-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadTaskImages(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.regen-task-btn').forEach(btn => {
    btn.addEventListener('click', () => regenerateTask(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.delete-task-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除此任务？')) return;
      try {
        await api('DELETE', `/tasks/${btn.dataset.id}`);
        showToast('任务已删除', 'success');
        renderTasks(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// 下载任务的所有输出图片
async function downloadTaskImages(taskId) {
  try {
    const task = await api('GET', `/tasks/${taskId}`);
    let images = [];
    try { images = JSON.parse(task.output_images || '[]'); } catch {}
    if (images.length === 0) {
      showToast('没有可下载的图片', 'warning');
      return;
    }
    images.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-${taskId}-${i + 1}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    showToast(`正在下载 ${images.length} 张图片`, 'success');
  } catch (err) {
    showToast('下载失败: ' + err.message, 'error');
  }
}

// 重新生成：以当前任务参数创建新任务
async function regenerateTask(taskId) {
  try {
    const task = await api('GET', `/tasks/${taskId}`);
    if (!task) { showToast('任务不存在', 'error'); return; }

    state.generating = true;
    showToast('正在以相同参数重新生成...', 'info');

    if (task.type === 'text-to-image') {
      const res = await api('POST', '/tasks/text-to-image', {
        prompt: task.prompt,
        aspect_ratio: task.aspect_ratio,
        resolution: task.resolution,
        output_format: task.output_format
      });
      pollTaskStatus(res.taskId);
    } else {
      // 图生图需要重新上传图片
      let inputImages = [];
      try { inputImages = JSON.parse(task.input_images || '[]'); } catch {}
      if (inputImages.length === 0) {
        showToast('图生图任务缺少参考图片，无法重新生成', 'warning');
        state.generating = false;
        return;
      }
      // 下载输入图片并重新上传
      const formData = new FormData();
      formData.append('prompt', task.prompt);
      formData.append('aspect_ratio', task.aspect_ratio);
      formData.append('resolution', task.resolution);
      formData.append('output_format', task.output_format);

      for (let i = 0; i < inputImages.length; i++) {
        try {
          const resp = await fetch(inputImages[i]);
          const blob = await resp.blob();
          formData.append('images', blob, `image-${i}.png`);
        } catch {
          showToast('参考图片下载失败，无法重新生成', 'error');
          state.generating = false;
          return;
        }
      }

      const res = await api('POST', '/tasks/image-to-image', formData, true);
      pollTaskStatus(res.taskId);
    }
  } catch (err) {
    state.generating = false;
    showToast('重新生成失败: ' + err.message, 'error');
  }
}

async function showTaskDetail(taskId) {
  try {
    const task = await api('GET', `/tasks/${taskId}`);
    let images = [];
    try { images = JSON.parse(task.output_images || '[]'); } catch {}
    let inputImages = [];
    try { inputImages = JSON.parse(task.input_images || '[]'); } catch {}

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h2>任务详情 #${task.id}</h2>
        <div class="form-group">
          <label>类型</label>
          <span class="type-badge ${task.type}">${task.type === 'text-to-image' ? '文生图' : '图生图'}</span>
        </div>
        <div class="form-group">
          <label>提示词</label>
          <div class="prompt-preview">${escapeHtml(task.prompt)}</div>
        </div>
        <div class="option-row">
          <div class="form-group">
            <label>画面比例</label>
            <p>${task.aspect_ratio}</p>
          </div>
          <div class="form-group">
            <label>画质</label>
            <p>${task.resolution.toUpperCase()}</p>
          </div>
        </div>
        <div class="option-row">
          <div class="form-group">
            <label>输出格式</label>
            <p>${task.output_format.toUpperCase()}</p>
          </div>
          <div class="form-group">
            <label>状态</label>
            <span class="status-badge ${task.status}">${statusText(task.status)}</span>
          </div>
        </div>
        ${task.inference_time ? `<p style="font-size:12px;color:var(--dark-light)">推理耗时: ${(task.inference_time / 1000).toFixed(1)}秒</p>` : ''}
        ${inputImages.length > 0 ? `
          <div style="margin-top:16px">
            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">参考图片</label>
            <div class="task-output-images">
              ${inputImages.map(url => `<img src="${url}" alt="输入图片" onclick="viewImage('${url}')">`).join('')}
            </div>
          </div>
        ` : ''}
        ${images.length > 0 ? `
          <div style="margin-top:16px">
            <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">生成结果</label>
            <div class="task-output-images">
              ${images.map(url => `<img src="${url}" alt="输出图片" onclick="viewImage('${url}')">`).join('')}
            </div>
          </div>
        ` : ''}
        ${task.error ? `<p style="color:var(--danger);margin-top:12px;font-size:13px">错误: ${escapeHtml(task.error)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" id="close-modal">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== 统计页面 =====
async function renderStats(container) {
  container.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><p>加载中...</p></div>`;

  try {
    const res = await api('GET', '/stats/my-stats');
    state.stats = res;
  } catch (err) {
    showToast('加载统计数据失败: ' + err.message, 'error');
    state.stats = { total: 0, byStatus: [], byType: [], byResolution: [], byAspectRatio: [], today: 0, last7Days: [] };
  }

  const s = state.stats;
  const completed = s.byStatus?.find(x => x.status === 'completed')?.count || 0;
  const failed = s.byStatus?.find(x => x.status === 'failed')?.count || 0;
  const processing = s.byStatus?.find(x => x.status === 'processing')?.count || 0;
  const t2i = s.byType?.find(x => x.type === 'text-to-image')?.count || 0;
  const i2i = s.byType?.find(x => x.type === 'image-to-image')?.count || 0;

  container.innerHTML = `
    <div class="page-header">
      <h1>使用统计</h1>
      <p>查看您的图片生成使用情况</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card purple">
        <div class="stat-icon">📊</div>
        <div class="stat-value">${s.total || 0}</div>
        <div class="stat-label">总任务数</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-icon">✅</div>
        <div class="stat-value">${completed}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card pink">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${s.today || 0}</div>
        <div class="stat-label">今日任务</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-icon">❌</div>
        <div class="stat-value">${failed}</div>
        <div class="stat-label">失败任务</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <h3>📈 近7天趋势</h3>
        <div class="trend-chart">
          ${(s.last7Days || []).map(d => `
            <div class="trend-bar">
              <div class="value">${d.count}</div>
              <div class="bar" style="height:${Math.max((d.count / Math.max(...(s.last7Days || []).map(x => x.count), 1)) * 120, 4)}px"></div>
              <div class="date">${d.date?.slice(5) || ''}</div>
            </div>
          `).join('') || '<div style="color:var(--gray);text-align:center;width:100%">暂无数据</div>'}
        </div>
      </div>

      <div class="chart-card">
        <h3>📊 任务类型分布</h3>
        <div class="bar-chart">
          <div class="bar-row">
            <div class="bar-label">文生图</div>
            <div class="bar-track">
              <div class="bar-fill purple" style="width:${s.total ? (t2i / s.total * 100) : 0}%">${t2i}</div>
            </div>
          </div>
          <div class="bar-row">
            <div class="bar-label">图生图</div>
            <div class="bar-track">
              <div class="bar-fill pink" style="width:${s.total ? (i2i / s.total * 100) : 0}%">${i2i}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <h3>🖥️ 画质分布</h3>
        <div class="bar-chart">
          ${(s.byResolution || []).map((r, i) => {
            const colors = ['purple', 'cyan', 'pink', 'yellow'];
            return `
              <div class="bar-row">
                <div class="bar-label">${r.resolution?.toUpperCase() || ''}</div>
                <div class="bar-track">
                  <div class="bar-fill ${colors[i % colors.length]}" style="width:${s.total ? (r.count / s.total * 100) : 0}%">${r.count}</div>
                </div>
              </div>
            `;
          }).join('') || '<div style="color:var(--gray)">暂无数据</div>'}
        </div>
      </div>

      <div class="chart-card">
        <h3>📐 画面比例分布</h3>
        <div class="bar-chart">
          ${(s.byAspectRatio || []).map((a, i) => {
            const colors = ['purple', 'cyan', 'pink', 'yellow', 'green', 'blue'];
            return `
              <div class="bar-row">
                <div class="bar-label">${a.aspect_ratio || ''}</div>
                <div class="bar-track">
                  <div class="bar-fill ${colors[i % colors.length]}" style="width:${s.total ? (a.count / s.total * 100) : 0}%">${a.count}</div>
                </div>
              </div>
            `;
          }).join('') || '<div style="color:var(--gray)">暂无数据</div>'}
        </div>
      </div>
    </div>
  `;
}

// ===== 全部任务（管理员） =====
async function renderAllTasks(container) {
  container.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><p>加载中...</p></div>`;

  try {
    const res = await api('GET', `/tasks/all-tasks?page=${state.allTaskPage}&pageSize=${state.taskPageSize}`);
    state.allTasks = res.tasks || [];
    state.allTaskTotal = res.total || 0;
  } catch (err) {
    showToast('加载任务列表失败', 'error');
  }

  const totalPages = Math.ceil(state.allTaskTotal / state.taskPageSize);

  container.innerHTML = `
    <div class="page-header">
      <h1>全部任务</h1>
      <p>查看所有用户的图片生成任务</p>
    </div>
    <div class="task-filters">
      <select id="admin-filter-status">
        <option value="">全部状态</option>
        <option value="pending">等待中</option>
        <option value="processing">处理中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
        <option value="timeout">异常</option>
      </select>
      <select id="admin-filter-type">
        <option value="">全部类型</option>
        <option value="text-to-image">文生图</option>
        <option value="image-to-image">图生图</option>
      </select>
      <input type="text" id="admin-search" placeholder="搜索提示词...">
      <button class="btn btn-secondary btn-sm" id="admin-search-btn">搜索</button>
      <button class="btn btn-ghost btn-sm" id="admin-refresh">刷新</button>
    </div>
    ${state.allTasks.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>暂无任务</h3>
      </div>
    ` : `
      <div class="card" style="padding:0;overflow-x:auto">
        <table class="task-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户</th>
              <th>类型</th>
              <th>提示词</th>
              <th>画面比例</th>
              <th>画质</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${state.allTasks.map(t => `
              <tr>
                <td>#${t.id}</td>
                <td>${escapeHtml(t.username || '')}</td>
                <td><span class="type-badge ${t.type}">${t.type === 'text-to-image' ? '文生图' : '图生图'}</span></td>
                <td><div class="prompt-preview">${escapeHtml(t.prompt)}</div></td>
                <td>${t.aspect_ratio}</td>
                <td>${t.resolution.toUpperCase()}</td>
                <td><span class="status-badge ${t.status}">${statusText(t.status)}</span></td>
                <td>${formatDate(t.created_at)}</td>
                <td><button class="btn btn-sm btn-ghost admin-view-btn" data-id="${t.id}">查看</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button ${state.allTaskPage <= 1 ? 'disabled' : ''} id="admin-prev">上一页</button>
        <span style="padding:8px 12px;font-size:13px;color:var(--dark-light)">${state.allTaskPage} / ${totalPages || 1}</span>
        <button ${state.allTaskPage >= totalPages ? 'disabled' : ''} id="admin-next">下一页</button>
      </div>
    `}
  `;

  document.getElementById('admin-refresh')?.addEventListener('click', () => renderAllTasks(container));
  document.getElementById('admin-prev')?.addEventListener('click', () => { state.allTaskPage--; renderAllTasks(container); });
  document.getElementById('admin-next')?.addEventListener('click', () => { state.allTaskPage++; renderAllTasks(container); });

  document.getElementById('admin-search-btn')?.addEventListener('click', async () => {
    const search = document.getElementById('admin-search').value;
    const status = document.getElementById('admin-filter-status').value;
    const type = document.getElementById('admin-filter-type').value;
    const res = await api('GET', `/tasks/all-tasks?page=1&pageSize=${state.taskPageSize}&search=${encodeURIComponent(search)}&status=${status}&type=${type}`);
    state.allTasks = res.tasks || [];
    state.allTaskTotal = res.total || 0;
    state.allTaskPage = 1;
    renderAllTasks(container);
  });

  container.querySelectorAll('.admin-view-btn').forEach(btn => {
    btn.addEventListener('click', () => showTaskDetail(parseInt(btn.dataset.id)));
  });
}

// ===== 用户管理（管理员） =====
async function renderUsers(container) {
  container.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><p>加载中...</p></div>`;

  try {
    state.users = await api('GET', '/auth/users');
  } catch (err) {
    showToast('加载用户列表失败', 'error');
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>用户管理</h1>
      <p>管理系统用户和查看使用情况</p>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="user-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>角色</th>
            <th>状态</th>
            <th>总任务数</th>
            <th>已完成</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${state.users.map(u => `
            <tr class="${u.status === 'disabled' ? 'user-disabled-row' : ''}">
              <td>#${u.id}</td>
              <td>${escapeHtml(u.username)}</td>
              <td><span class="role-badge ${u.role}">${u.role === 'admin' ? '管理员' : '用户'}</span></td>
              <td><span class="status-badge ${u.status === 'disabled' ? 'disabled' : 'enabled'}">${u.status === 'disabled' ? '已禁用' : '正常'}</span></td>
              <td>${u.total_tasks || 0}</td>
              <td>${u.completed_tasks || 0}</td>
              <td>${formatDate(u.created_at)}</td>
              <td class="action-cell">
                <button class="btn btn-sm btn-info view-user-btn" data-id="${u.id}" title="查看使用详情">查看</button>
                ${u.role !== 'admin' && u.id !== state.user.id ? `
                  ${u.status !== 'disabled'
                    ? `<button class="btn btn-sm btn-warning disable-user-btn" data-id="${u.id}">禁用</button>`
                    : `<button class="btn btn-sm btn-success enable-user-btn" data-id="${u.id}">启用</button>`
                  }
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div id="user-detail-modal"></div>
  `;

  // 查看用户详情
  container.querySelectorAll('.view-user-btn').forEach(btn => {
    btn.addEventListener('click', () => showUserDetail(btn.dataset.id));
  });

  // 禁用用户
  container.querySelectorAll('.disable-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定禁用此用户？禁用后该用户将无法登录')) return;
      try {
        await api('PUT', `/auth/users/${btn.dataset.id}/status`, { status: 'disabled' });
        showToast('用户已禁用', 'success');
        renderUsers(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // 启用用户
  container.querySelectorAll('.enable-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('PUT', `/auth/users/${btn.dataset.id}/status`, { status: 'enabled' });
        showToast('用户已启用', 'success');
        renderUsers(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// 显示用户使用详情弹窗
async function showUserDetail(userId) {
  const modalEl = document.getElementById('user-detail-modal');
  if (!modalEl) return;

  modalEl.innerHTML = `<div class="modal-overlay"><div class="modal-content user-detail-modal"><div class="loading-spinner"></div><p>加载中...</p></div></div>`;

  try {
    const data = await api('GET', `/auth/users/${userId}/details`);
    const { user, stats, recentTasks } = data;

    const statusMap = { pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败', timeout: '超时' };
    const typeMap = { 'text-to-image': '文生图', 'image-to-image': '图生图' };

    modalEl.innerHTML = `
      <div class="modal-overlay" id="user-detail-overlay">
        <div class="modal-content user-detail-modal">
          <div class="modal-header">
            <h2>${escapeHtml(user.username)} 的使用详情</h2>
            <button class="modal-close" id="close-user-detail">&times;</button>
          </div>
          <div class="modal-body">
            <div class="detail-info-row">
              <span class="detail-label">角色</span>
              <span class="role-badge ${user.role}">${user.role === 'admin' ? '管理员' : '用户'}</span>
              <span class="detail-label" style="margin-left:24px">状态</span>
              <span class="status-badge ${user.status === 'disabled' ? 'disabled' : 'enabled'}">${user.status === 'disabled' ? '已禁用' : '正常'}</span>
              <span class="detail-label" style="margin-left:24px">注册时间</span>
              <span>${formatDate(user.created_at)}</span>
            </div>

            <div class="detail-stats-grid">
              <div class="detail-stat-card">
                <div class="stat-number">${stats.total}</div>
                <div class="stat-label">总任务</div>
              </div>
              <div class="detail-stat-card">
                <div class="stat-number">${stats.today}</div>
                <div class="stat-label">今日任务</div>
              </div>
              <div class="detail-stat-card">
                <div class="stat-number">${stats.byStatus.find(s => s.status === 'completed')?.count || 0}</div>
                <div class="stat-label">已完成</div>
              </div>
              <div class="detail-stat-card">
                <div class="stat-number">${stats.byStatus.find(s => s.status === 'failed')?.count || 0}</div>
                <div class="stat-label">失败</div>
              </div>
            </div>

            <div class="detail-section">
              <h3>任务类型分布</h3>
              <div class="detail-bars">
                ${stats.byType.map(t => `
                  <div class="detail-bar-row">
                    <span class="bar-label">${typeMap[t.type] || t.type}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${stats.total > 0 ? (t.count / stats.total * 100) : 0}%"></div></div>
                    <span class="bar-count">${t.count}</span>
                  </div>
                `).join('') || '<p class="no-data">暂无数据</p>'}
              </div>
            </div>

            <div class="detail-section">
              <h3>画质分布</h3>
              <div class="detail-bars">
                ${stats.byResolution.map(t => `
                  <div class="detail-bar-row">
                    <span class="bar-label">${t.resolution}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${stats.total > 0 ? (t.count / stats.total * 100) : 0}%"></div></div>
                    <span class="bar-count">${t.count}</span>
                  </div>
                `).join('') || '<p class="no-data">暂无数据</p>'}
              </div>
            </div>

            <div class="detail-section">
              <h3>画面比例分布</h3>
              <div class="detail-bars">
                ${stats.byAspectRatio.map(t => `
                  <div class="detail-bar-row">
                    <span class="bar-label">${t.aspect_ratio}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${stats.total > 0 ? (t.count / stats.total * 100) : 0}%"></div></div>
                    <span class="bar-count">${t.count}</span>
                  </div>
                `).join('') || '<p class="no-data">暂无数据</p>'}
              </div>
            </div>

            <div class="detail-section">
              <h3>最近任务（最新20条）</h3>
              <div style="overflow-x:auto">
                <table class="user-table detail-task-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>提示词</th>
                      <th>画面比例</th>
                      <th>画质</th>
                      <th>状态</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentTasks.map(t => `
                      <tr>
                        <td>${typeMap[t.type] || t.type}</td>
                        <td class="prompt-cell" title="${escapeHtml(t.prompt)}">${escapeHtml(t.prompt.length > 30 ? t.prompt.substring(0, 30) + '...' : t.prompt)}</td>
                        <td>${t.aspect_ratio}</td>
                        <td>${t.resolution}</td>
                        <td><span class="task-status-badge ${t.status}">${statusMap[t.status] || t.status}</span></td>
                        <td>${formatDate(t.created_at)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="6" style="text-align:center">暂无任务</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 关闭弹窗
    document.getElementById('close-user-detail').addEventListener('click', () => {
      modalEl.innerHTML = '';
    });
    document.getElementById('user-detail-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'user-detail-overlay') modalEl.innerHTML = '';
    });
  } catch (err) {
    modalEl.innerHTML = '';
    showToast('获取用户详情失败: ' + err.message, 'error');
  }
}

// ===== 系统设置（管理员） =====
async function renderSettings(container) {
  container.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><p>加载中...</p></div>`;

  try {
    state.settings = await api('GET', '/settings');
  } catch (err) {
    showToast('加载设置失败', 'error');
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>系统设置</h1>
      <p>配置系统参数和API密钥</p>
    </div>
    <div class="settings-grid">
      <div class="settings-section">
        <h3>🔑 API 配置</h3>
        <div class="setting-item">
          <label>WaveSpeed API Key</label>
          <input type="password" id="set-api-key" value="${state.settings.wavespeed_api_key || ''}" placeholder="输入您的 WaveSpeed API Key">
          <div class="hint">在 wavespeed.ai 获取 API Key</div>
        </div>
      </div>
      <div class="settings-section">
        <h3>🎨 默认生成参数</h3>
        <div class="setting-item">
          <label>默认画质</label>
          <select id="set-resolution">
            <option value="0.5k" ${state.settings.default_resolution === '0.5k' ? 'selected' : ''}>0.5K 快速预览</option>
            <option value="1k" ${state.settings.default_resolution === '1k' ? 'selected' : ''}>1K 标准</option>
            <option value="2k" ${state.settings.default_resolution === '2k' ? 'selected' : ''}>2K 高清</option>
            <option value="4k" ${state.settings.default_resolution === '4k' ? 'selected' : ''}>4K 超高清</option>
          </select>
        </div>
        <div class="setting-item">
          <label>默认画面比例</label>
          <select id="set-aspect">
            ${['1:1','16:9','9:16','4:3','3:4','3:2','2:3','4:5','5:4','21:9'].map(r =>
              `<option value="${r}" ${state.settings.default_aspect_ratio === r ? 'selected' : ''}>${r}</option>`
            ).join('')}
          </select>
        </div>
        <div class="setting-item">
          <label>默认输出格式</label>
          <select id="set-format">
            <option value="png" ${state.settings.default_output_format === 'png' ? 'selected' : ''}>PNG</option>
            <option value="jpeg" ${state.settings.default_output_format === 'jpeg' ? 'selected' : ''}>JPEG</option>
          </select>
        </div>
      </div>
      <div class="settings-section">
        <h3>⚙️ 系统参数</h3>
        <div class="setting-item">
          <label>系统名称</label>
          <input type="text" id="set-system-name" value="${state.settings.system_name || 'AI图片处理系统'}">
        </div>
        <div class="setting-item">
          <label>每用户每日任务上限</label>
          <input type="number" id="set-max-tasks" value="${state.settings.max_tasks_per_user_per_day || 100}" min="1" max="1000">
        </div>
      </div>
      <div class="settings-section">
        <h3>📊 全局统计</h3>
        <div id="global-stats-area">
          <button class="btn btn-secondary btn-sm" id="load-global-stats">加载全局统计</button>
        </div>
      </div>
    </div>
    <div style="margin-top:24px;text-align:center">
      <button class="btn btn-primary" id="save-settings" style="width:auto;padding:12px 48px">保存设置</button>
    </div>
  `;

  document.getElementById('save-settings').addEventListener('click', async () => {
    try {
      await api('PUT', '/settings', {
        wavespeed_api_key: document.getElementById('set-api-key').value,
        default_resolution: document.getElementById('set-resolution').value,
        default_aspect_ratio: document.getElementById('set-aspect').value,
        default_output_format: document.getElementById('set-format').value,
        system_name: document.getElementById('set-system-name').value,
        max_tasks_per_user_per_day: document.getElementById('set-max-tasks').value
      });
      // 更新state中的设置，使其他页面实时生效
      state.settings.wavespeed_api_key = document.getElementById('set-api-key').value;
      state.settings.default_resolution = document.getElementById('set-resolution').value;
      state.settings.default_aspect_ratio = document.getElementById('set-aspect').value;
      state.settings.default_output_format = document.getElementById('set-format').value;
      state.settings.system_name = document.getElementById('set-system-name').value;
      state.settings.max_tasks_per_user_per_day = document.getElementById('set-max-tasks').value;
      state.systemName = document.getElementById('set-system-name').value;
      document.title = state.systemName;
      showToast('设置已保存', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('load-global-stats')?.addEventListener('click', async () => {
    try {
      const gs = await api('GET', '/stats/global-stats');
      document.getElementById('global-stats-area').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="stat-card purple" style="padding:16px">
            <div class="stat-value" style="font-size:24px">${gs.total}</div>
            <div class="stat-label">总任务数</div>
          </div>
          <div class="stat-card cyan" style="padding:16px">
            <div class="stat-value" style="font-size:24px">${gs.totalUsers}</div>
            <div class="stat-label">注册用户</div>
          </div>
          <div class="stat-card pink" style="padding:16px">
            <div class="stat-value" style="font-size:24px">${gs.today}</div>
            <div class="stat-label">今日任务</div>
          </div>
          <div class="stat-card yellow" style="padding:16px">
            <div class="stat-value" style="font-size:24px">${gs.byStatus?.find(x => x.status === 'completed')?.count || 0}</div>
            <div class="stat-label">已完成</div>
          </div>
        </div>
        ${gs.userRanking?.length ? `
          <h4 style="margin-top:16px;font-size:13px;font-weight:700">用户排行</h4>
          <div class="ranking-list">
            ${gs.userRanking.map((u, i) => `
              <div class="ranking-item">
                <div class="ranking-num ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${i + 1}</div>
                <div class="ranking-name">${escapeHtml(u.username)}</div>
                <div class="ranking-count">${u.task_count} 任务</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ===== 个人设置 =====
function renderProfile(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>个人设置</h1>
      <p>修改您的个人信息和密码</p>
    </div>
    <div class="card">
      <div class="password-form">
        <h3 style="margin-bottom:20px">修改密码</h3>
        <div class="form-group">
          <label>旧密码</label>
          <input type="password" id="old-password" placeholder="请输入旧密码">
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input type="password" id="new-password" placeholder="请输入新密码（至少6位）">
        </div>
        <div class="form-group">
          <label>确认新密码</label>
          <input type="password" id="confirm-new-password" placeholder="请再次输入新密码">
        </div>
        <button class="btn btn-primary" id="change-password">修改密码</button>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <h3 style="margin-bottom:12px">账户信息</h3>
      <p style="font-size:14px;color:var(--dark-light)">用户名: <strong>${escapeHtml(state.user.username)}</strong></p>
      <p style="font-size:14px;color:var(--dark-light);margin-top:8px">角色: <span class="role-badge ${state.user.role}">${state.user.role === 'admin' ? '管理员' : '用户'}</span></p>
    </div>
  `;

  document.getElementById('change-password').addEventListener('click', async () => {
    const oldPwd = document.getElementById('old-password').value;
    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-new-password').value;

    if (!oldPwd || !newPwd) { showToast('请填写完整', 'warning'); return; }
    if (newPwd !== confirmPwd) { showToast('两次密码不一致', 'warning'); return; }
    if (newPwd.length < 6) { showToast('新密码至少6位', 'warning'); return; }

    try {
      await api('PUT', '/auth/change-password', { oldPassword: oldPwd, newPassword: newPwd });
      showToast('密码修改成功', 'success');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-new-password').value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ===== 工具函数 =====
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusText(status) {
  const map = { pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败', timeout: '异常' };
  return map[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ===== 启动 =====
(async function init() {
  // 先检查授权状态
  const licenseData = await checkLicense();
  if (licenseData.authorized) {
    // 已授权，正常加载
    loadPublicSettings();
  }
  render();
})();
