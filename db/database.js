const initSQL = require('./init');
const config = require('../config');
const path = require('path');
const fs = require('fs');

let db = null;

async function getDb() {
  if (db) return db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = config.DB_PATH;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    db.run(initSQL);
    // 创建默认管理员
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      [config.ADMIN_USERNAME, hashedPassword, 'admin']);
    saveDb();
  }

  return db;
}

// 数据库迁移：确保 tasks 表支持 timeout 状态
function migrateDb() {
  try {
    // 检查是否已有 timeout 状态的 CHECK 约束
    const tableInfo = queryAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (tableInfo.length > 0 && !tableInfo[0].sql.includes('timeout')) {
      console.log('[Migration] 更新 tasks 表约束，添加 timeout 状态...');
      db.run(`
        CREATE TABLE tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('text-to-image', 'image-to-image')),
          prompt TEXT NOT NULL,
          aspect_ratio TEXT DEFAULT '1:1',
          resolution TEXT DEFAULT '1k',
          output_format TEXT DEFAULT 'png',
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'timeout')),
          request_id TEXT,
          input_images TEXT,
          output_images TEXT,
          error TEXT,
          inference_time INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      db.run('INSERT INTO tasks_new SELECT * FROM tasks');
      db.run('DROP TABLE tasks');
      db.run('ALTER TABLE tasks_new RENAME TO tasks');
      saveDb();
      console.log('[Migration] tasks 表约束更新完成');
    }

    // 添加用户 status 字段（启用/禁用）
    const userTableInfo = queryAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (userTableInfo.length > 0 && !userTableInfo[0].sql.includes('status')) {
      console.log('[Migration] 添加 users 表 status 字段...');
      db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled'))`);
      saveDb();
      console.log('[Migration] users 表 status 字段添加完成');
    }
  } catch (err) {
    console.error('[Migration] 迁移失败:', err.message);
  }
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  fs.writeFileSync(config.DB_PATH, buffer);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  // sql.js 不直接暴露 lastInsertRowid，通过查询获取
  let lastId = null;
  try {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    if (stmt.step()) {
      lastId = stmt.getAsObject().id;
    }
    stmt.free();
  } catch {}
  saveDb();
  return {
    lastInsertRowid: lastId
  };
}

module.exports = { getDb, saveDb, queryAll, queryOne, run, migrateDb };
