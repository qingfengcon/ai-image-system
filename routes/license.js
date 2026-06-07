const express = require('express');
const { getMachineId, getMachineInfo } = require('../services/machineId');
const { verifyLicenseKey, getTypeName } = require('../services/license');
const { queryOne, run } = require('../db/database');

const router = express.Router();

/**
 * 获取授权状态（公开接口，无需登录）
 * 返回当前机器ID和授权状态
 */
router.get('/status', (req, res) => {
  try {
    const machineId = getMachineId();
    const licenseRecord = queryOne('SELECT * FROM license WHERE machine_id = ?', [machineId]);

    if (licenseRecord && licenseRecord.license_key) {
      // 重新验证授权码（可能已过期）
      const result = verifyLicenseKey(machineId, licenseRecord.license_key);
      if (result.valid) {
        return res.json({
          authorized: true,
          machineId,
          type: result.type,
          typeName: getTypeName(result.type),
          expireDate: result.expireDate,
          message: result.message
        });
      } else {
        // 授权已失效
        return res.json({
          authorized: false,
          machineId,
          message: result.message
        });
      }
    }

    res.json({
      authorized: false,
      machineId,
      message: '系统未授权'
    });
  } catch (err) {
    console.error(`[License] 获取授权状态失败: ${err.message}`);
    res.status(500).json({ error: '获取授权状态失败' });
  }
});

/**
 * 提交授权码（公开接口，无需登录，因为未授权时无法登录）
 */
router.post('/activate', (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: '请输入授权码' });
    }

    const machineId = getMachineId();
    console.log(`[License] 尝试激活 | 机器ID: ${machineId} | 授权码: ${licenseKey.substring(0, 10)}...`);

    // 验证授权码
    const result = verifyLicenseKey(machineId, licenseKey);
    if (!result.valid) {
      console.warn(`[License] 激活失败: ${result.message}`);
      return res.status(400).json({ error: result.message });
    }

    // 保存授权信息到数据库
    run(`CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      license_key TEXT NOT NULL,
      type TEXT NOT NULL,
      expire_date TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 检查是否已有该机器的授权记录
    const existing = queryOne('SELECT * FROM license WHERE machine_id = ?', [machineId]);
    if (existing) {
      run('UPDATE license SET license_key = ?, type = ?, expire_date = ?, activated_at = CURRENT_TIMESTAMP WHERE machine_id = ?',
        [licenseKey, result.type, result.expireDate, machineId]);
    } else {
      run('INSERT INTO license (machine_id, license_key, type, expire_date) VALUES (?, ?, ?, ?)',
        [machineId, licenseKey, result.type, result.expireDate]);
    }

    console.log(`[License] 激活成功 | 类型: ${getTypeName(result.type)} | ${result.message}`);
    res.json({
      success: true,
      type: result.type,
      typeName: getTypeName(result.type),
      expireDate: result.expireDate,
      message: result.message
    });
  } catch (err) {
    console.error(`[License] 激活异常: ${err.message}`);
    res.status(500).json({ error: '激活失败: ' + err.message });
  }
});

/**
 * 获取机器信息（用于授权码生成工具，需要管理员权限）
 */
router.get('/machine-info', (req, res) => {
  try {
    const info = getMachineInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: '获取机器信息失败' });
  }
});

module.exports = router;
