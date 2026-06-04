const express = require('express');
const { queryAll, queryOne, run } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取所有设置
router.get('/', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const settings = queryAll('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.json(settingsMap);
  } catch (err) {
    console.error(`[Settings] 获取设置失败: ${err.message}`);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 更新设置
router.put('/', authMiddleware, adminMiddleware, (req, res) => {
  try {
    console.log(`[Settings] 保存设置请求 | 用户: ${req.user.username}(${req.user.id})`);
    const { wavespeed_api_key, default_resolution, default_aspect_ratio, default_output_format, max_tasks_per_user_per_day, system_name } = req.body;

    const updates = {
      wavespeed_api_key,
      default_resolution,
      default_aspect_ratio,
      default_output_format,
      max_tasks_per_user_per_day,
      system_name
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, String(value)]);
      }
    });

    console.log(`[Settings] 设置保存成功`);
    res.json({ message: '设置已更新' });
  } catch (err) {
    console.error(`[Settings] 保存设置失败: ${err.message}`);
    res.status(500).json({ error: '更新设置失败' });
  }
});

// 获取公开设置（不需要管理员权限）
router.get('/public', (req, res) => {
  try {
    const systemName = queryOne('SELECT value FROM settings WHERE key = ?', ['system_name']);
    res.json({
      system_name: systemName?.value || 'AI图片处理系统'
    });
  } catch (err) {
    res.status(500).json({ error: '获取设置失败' });
  }
});

module.exports = router;
