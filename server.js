const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { getDb, migrateDb } = require('./db/database');
const { run, queryAll } = require('./db/database');

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
}

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// API路由
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
