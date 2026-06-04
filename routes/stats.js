const express = require('express');
const { queryAll, queryOne, run } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取当前用户的统计数据
router.get('/my-stats', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // 总任务数
    const total = queryOne('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?', [userId]);
    // 各状态任务数
    const byStatus = queryAll(
      'SELECT status, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY status',
      [userId]
    );
    // 各类型任务数
    const byType = queryAll(
      'SELECT type, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY type',
      [userId]
    );
    // 各分辨率任务数
    const byResolution = queryAll(
      'SELECT resolution, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY resolution',
      [userId]
    );
    // 各画面比例任务数
    const byAspectRatio = queryAll(
      'SELECT aspect_ratio, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY aspect_ratio',
      [userId]
    );
    // 今日任务数
    const today = queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date(created_at) = date('now')`,
      [userId]
    );
    // 最近7天每日任务数
    const last7Days = queryAll(
      `SELECT date(created_at) as date, COUNT(*) as count FROM tasks
       WHERE user_id = ? AND created_at >= date('now', '-7 days')
       GROUP BY date(created_at) ORDER BY date`,
      [userId]
    );

    res.json({
      total: total.count,
      byStatus,
      byType,
      byResolution,
      byAspectRatio,
      today: today.count,
      last7Days
    });
  } catch (err) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 管理员：全局统计数据
router.get('/global-stats', authMiddleware, adminMiddleware, (req, res) => {
  try {
    // 总任务数
    const total = queryOne('SELECT COUNT(*) as count FROM tasks');
    // 各状态任务数
    const byStatus = queryAll('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    // 各类型任务数
    const byType = queryAll('SELECT type, COUNT(*) as count FROM tasks GROUP BY type');
    // 各分辨率任务数
    const byResolution = queryAll('SELECT resolution, COUNT(*) as count FROM tasks GROUP BY resolution');
    // 各画面比例任务数
    const byAspectRatio = queryAll('SELECT aspect_ratio, COUNT(*) as count FROM tasks GROUP BY aspect_ratio');
    // 用户总数
    const totalUsers = queryOne('SELECT COUNT(*) as count FROM users');
    // 今日任务数
    const today = queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE date(created_at) = date('now')`
    );
    // 最近7天每日任务数
    const last7Days = queryAll(
      `SELECT date(created_at) as date, COUNT(*) as count FROM tasks
       WHERE created_at >= date('now', '-7 days')
       GROUP BY date(created_at) ORDER BY date`
    );
    // 各用户任务数排行
    const userRanking = queryAll(
      `SELECT u.username, COUNT(t.id) as task_count,
       SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_count
       FROM users u LEFT JOIN tasks t ON u.id = t.user_id
       GROUP BY u.id ORDER BY task_count DESC LIMIT 10`
    );

    res.json({
      total: total.count,
      byStatus,
      byType,
      byResolution,
      byAspectRatio,
      totalUsers: totalUsers.count,
      today: today.count,
      last7Days,
      userRanking
    });
  } catch (err) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

module.exports = router;
