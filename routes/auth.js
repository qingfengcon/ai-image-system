const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { queryAll, queryOne, run } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在3-20之间' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    const existing = queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, 'user']);

    const token = jwt.sign(
      { id: result.lastInsertRowid, username, role: 'user' },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '注册成功',
      token,
      user: { id: result.lastInsertRowid, username, role: 'user' }
    });
  } catch (err) {
    res.status(500).json({ error: '注册失败: ' + err.message });
  }
});

// 登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: '登录失败: ' + err.message });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = queryOne('SELECT id, username, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 修改密码
router.put('/change-password', authMiddleware, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, req.user.id]);

    res.json({ message: '密码修改成功' });
  } catch (err) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

// 管理员：获取所有用户列表
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = queryAll('SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at DESC');
    // 获取每个用户的任务统计
    const usersWithStats = users.map(user => {
      const stats = queryOne(
        'SELECT COUNT(*) as total_tasks, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_tasks FROM tasks WHERE user_id = ?',
        [user.id]
      );
      return { ...user, ...stats };
    });
    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 管理员：删除用户
router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: '不能删除自己' });
    }
    const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    run('DELETE FROM tasks WHERE user_id = ?', [userId]);
    run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: '用户已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除用户失败' });
  }
});

module.exports = router;
