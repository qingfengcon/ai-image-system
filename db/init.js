const initSQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
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
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('wavespeed_api_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_resolution', '1k');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_aspect_ratio', '1:1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_output_format', 'png');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_tasks_per_user_per_day', '100');
INSERT OR IGNORE INTO settings (key, value) VALUES ('system_name', 'AI图片处理系统');
`;

module.exports = initSQL;
