const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { getDb, migrateDb } = require('./db/database');
const { run, queryAll, queryOne } = require('./db/database');
const { getMachineId } = require('./services/machineId');
const { verifyLicenseKey } = require('./services/license');

const app = express();

// 初始化数据库
async function initApp() {
  await getDb();
  migrateDb();
  console.log('数据库初始化完成');

  // 确保上传目录存在
  const dirs = [
    config.UPLOAD_DIR,
    path.join(config.UPLOAD_DIR, 'input'),
    path.join(config.UPLOAD_DIR, 'output')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // 初始化license表
  try {
    run(`CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      license_key TEXT NOT NULL,
      type TEXT NOT NULL,
      expire_date TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (e) { /* 忽略已存在的情况 */ }

  // 启动时检查授权状态
  const machineId = getMachineId();
  const licenseRecord = queryOne('SELECT * FROM license WHERE machine_id = ?', [machineId]);
  if (licenseRecord && licenseRecord.license_key) {
    const result = verifyLicenseKey(machineId, licenseRecord.license_key);
    if (result.valid) {
      console.log(`[License] 系统已授权 | 机器ID: ${machineId} | ${result.message}`);
    } else {
      console.warn(`[License] 授权已失效 | 机器ID: ${machineId} | ${result.message}`);
    }
  } else {
    console.warn(`[License] 系统未授权 | 机器ID: ${machineId}`);
    console.warn(`[License] 请在页面中输入授权码激活系统`);
  }

  // 启动时加载系统默认设置
  const defaultKeys = ['default_resolution', 'default_aspect_ratio', 'default_output_format', 'system_name'];
  const defaults = {};
  defaultKeys.forEach(key => {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    if (row) defaults[key] = row.value;
  });
  console.log(`[Settings] 系统默认设置已加载`);
  console.log(`[Settings] 画面比例: ${defaults.default_aspect_ratio || '1:1'}`);
  console.log(`[Settings] 分辨率: ${defaults.default_resolution || '1k'}`);
  console.log(`[Settings] 输出格式: ${defaults.default_output_format || 'png'}`);
  console.log(`[Settings] 系统名称: ${defaults.system_name || 'AI图片处理系统'}`);
}

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// API路由 - 授权相关（无需授权检查）
app.use('/api/license', require('./routes/license'));

// 授权检查中间件（排除授权相关和公开接口）
app.use('/api', (req, res, next) => {
  // 授权相关接口和公开设置接口不需要检查授权
  if (req.path.startsWith('/license/') || req.path === '/settings/public') {
    return next();
  }

  try {
    const machineId = getMachineId();
    const licenseRecord = queryOne('SELECT * FROM license WHERE machine_id = ?', [machineId]);
    if (licenseRecord && licenseRecord.license_key) {
      const result = verifyLicenseKey(machineId, licenseRecord.license_key);
      if (result.valid) {
        return next();
      }
    }
    return res.status(403).json({ error: '系统未授权，请先输入授权码', code: 'LICENSE_REQUIRED' });
  } catch (err) {
    console.error(`[License] 授权检查异常: ${err.message}`);
    return next();
  }
});

// 需要授权的API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
initApp().then(() => {
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://localhost:${config.PORT}`);
    console.log(`局域网访问: http://<本机IP>:${config.PORT}`);
    console.log(`默认管理员账号: admin / admin123`);
  });

  // 定时扫描超时任务：每2分钟检查一次，处理中超过10分钟的任务标记为异常
  const TASK_TIMEOUT_MINUTES = 10;
  setInterval(() => {
    try {
      const staleTasks = queryAll(
        `SELECT id, created_at FROM tasks WHERE status = 'processing' AND datetime(created_at) <= datetime('now', '-${TASK_TIMEOUT_MINUTES} minutes')`
      );
      if (staleTasks.length > 0) {
        console.warn(`[Timeout] 发现 ${staleTasks.length} 个超时任务，标记为异常`);
        staleTasks.forEach(t => {
          console.warn(`[Timeout] 任务 #${t.id} 超时，创建于 ${t.created_at}`);
        });
        run(
          `UPDATE tasks SET status = 'timeout', error = '任务超时未返回结果' WHERE status = 'processing' AND datetime(created_at) <= datetime('now', '-${TASK_TIMEOUT_MINUTES} minutes')`
        );
      }
    } catch (err) {
      console.error(`[Timeout] 扫描超时任务异常: ${err.message}`);
    }
  }, 2 * 60 * 1000);
}).catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});

function cors() {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  };
}

module.exports = app;
