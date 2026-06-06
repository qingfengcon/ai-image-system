const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { queryAll, queryOne, run } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const wavespeed = require('../services/wavespeed');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.UPLOAD_DIR, 'input');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// 文生图
router.post('/text-to-image', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, aspect_ratio, resolution, output_format, enable_web_search, enable_image_search } = req.body;
    console.log(`[Task] 文生图请求 | 用户: ${req.user.username}(${req.user.id}) | 提示词: ${prompt?.slice(0, 60)}...`);

    if (!prompt) {
      console.warn(`[Task] 文生图参数校验失败: 提示词为空`);
      return res.status(400).json({ error: '提示词不能为空' });
    }

    // 检查每日任务限制
    const limitSetting = queryOne('SELECT value FROM settings WHERE key = ?', ['max_tasks_per_user_per_day']);
    const dailyLimit = parseInt(limitSetting?.value || '100');
    const todayCount = queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date(created_at) = date('now')`,
      [req.user.id]
    );
    console.log(`[Task] 每日限制检查: 今日已用 ${todayCount.count}/${dailyLimit}`);
    if (todayCount.count >= dailyLimit) {
      console.warn(`[Task] 用户 ${req.user.username} 今日任务已达上限`);
      return res.status(429).json({ error: `今日任务已达上限(${dailyLimit}次)` });
    }

    // 获取默认设置
    const defaultResolution = queryOne('SELECT value FROM settings WHERE key = ?', ['default_resolution']);
    const defaultAspectRatio = queryOne('SELECT value FROM settings WHERE key = ?', ['default_aspect_ratio']);
    const defaultOutputFormat = queryOne('SELECT value FROM settings WHERE key = ?', ['default_output_format']);

    const finalResolution = resolution || defaultResolution?.value || '1k';
    const finalAspectRatio = aspect_ratio || defaultAspectRatio?.value || '1:1';
    const finalOutputFormat = output_format || defaultOutputFormat?.value || 'png';
    console.log(`[Task] 最终参数: aspect_ratio=${finalAspectRatio}, resolution=${finalResolution}, format=${finalOutputFormat}`);

    // 创建任务记录
    const taskResult = run(
      `INSERT INTO tasks (user_id, type, prompt, aspect_ratio, resolution, output_format, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, 'text-to-image', prompt, finalAspectRatio, finalResolution, finalOutputFormat, 'processing']
    );

    const taskId = taskResult.lastInsertRowid;
    console.log(`[Task] 任务记录已创建: taskId=${taskId}`);

    // 调用WaveSpeed API
    try {
      console.log(`[Task] 开始调用WaveSpeed文生图API...`);
      const apiResult = await wavespeed.textToImage({
        prompt,
        aspect_ratio: finalAspectRatio,
        resolution: finalResolution,
        output_format: finalOutputFormat,
        enable_web_search: enable_web_search || false,
        enable_image_search: enable_image_search || false
      });

      const requestId = apiResult.data?.id;
      console.log(`[Task] WaveSpeed API返回成功: requestId=${requestId}, 耗时=${Date.now() - startTime}ms`);
      run('UPDATE tasks SET request_id = ? WHERE id = ?', [requestId, taskId]);
      console.log(`[Task] 任务 ${taskId} 已绑定 requestId=${requestId}, 开始轮询`);

      // 轮询获取结果
      pollTaskResult(taskId, requestId);

      res.json({
        message: '任务已提交',
        taskId,
        requestId
      });
    } catch (apiErr) {
      const errorMsg = apiErr.response?.data?.message || apiErr.message;
      console.error(`[Task] WaveSpeed API调用失败: taskId=${taskId}, 错误: ${errorMsg}`);
      console.error(`[Task] API错误详情: status=${apiErr.response?.status}, data=${JSON.stringify(apiErr.response?.data || {})}`);
      run('UPDATE tasks SET status = ?, error = ? WHERE id = ?', ['failed', errorMsg, taskId]);
      res.status(500).json({ error: 'API调用失败: ' + errorMsg });
    }
  } catch (err) {
    console.error(`[Task] 文生图任务创建异常: ${err.message}`, err.stack);
    res.status(500).json({ error: '创建任务失败: ' + err.message });
  }
});

// 图生图
router.post('/image-to-image', authMiddleware, upload.array('images', 14), async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, aspect_ratio, resolution, output_format, enable_web_search, enable_image_search } = req.body;
    const files = req.files || [];
    console.log(`[Task] 图生图请求 | 用户: ${req.user.username}(${req.user.id}) | 图片: ${files.length}张 | 提示词: ${prompt?.slice(0, 60)}...`);

    if (!prompt) {
      console.warn(`[Task] 图生图参数校验失败: 提示词为空`);
      return res.status(400).json({ error: '提示词不能为空' });
    }

    if (files.length === 0) {
      console.warn(`[Task] 图生图参数校验失败: 未上传参考图片`);
      return res.status(400).json({ error: '请上传至少一张参考图片' });
    }

    // 检查每日任务限制
    const limitSetting = queryOne('SELECT value FROM settings WHERE key = ?', ['max_tasks_per_user_per_day']);
    const dailyLimit = parseInt(limitSetting?.value || '100');
    const todayCount = queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date(created_at) = date('now')`,
      [req.user.id]
    );
    console.log(`[Task] 每日限制检查: 今日已用 ${todayCount.count}/${dailyLimit}`);
    if (todayCount.count >= dailyLimit) {
      console.warn(`[Task] 用户 ${req.user.username} 今日任务已达上限`);
      return res.status(429).json({ error: `今日任务已达上限(${dailyLimit}次)` });
    }

    const defaultResolution = queryOne('SELECT value FROM settings WHERE key = ?', ['default_resolution']);
    const defaultAspectRatio = queryOne('SELECT value FROM settings WHERE key = ?', ['default_aspect_ratio']);
    const defaultOutputFormat = queryOne('SELECT value FROM settings WHERE key = ?', ['default_output_format']);

    const finalResolution = resolution || defaultResolution?.value || '1k';
    const finalAspectRatio = aspect_ratio || defaultAspectRatio?.value || '1:1';
    const finalOutputFormat = output_format || defaultOutputFormat?.value || 'png';
    console.log(`[Task] 最终参数: aspect_ratio=${finalAspectRatio}, resolution=${finalResolution}, format=${finalOutputFormat}`);

    // 将上传的文件转为可访问的URL（使用本地路径）
    const imageUrls = files.map(f => `/uploads/input/${f.filename}`);
    console.log(`[Task] 上传文件本地路径: ${JSON.stringify(imageUrls)}`);

    // 创建任务记录
    const taskResult = run(
      `INSERT INTO tasks (user_id, type, prompt, aspect_ratio, resolution, output_format, status, input_images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, 'image-to-image', prompt, finalAspectRatio, finalResolution, finalOutputFormat, 'processing', JSON.stringify(imageUrls)]
    );

    const taskId = taskResult.lastInsertRowid;
    console.log(`[Task] 任务记录已创建: taskId=${taskId}`);

    // 上传图片到WaveSpeed CDN获取公网URL
    let cdnUrls = [];
    try {
      console.log(`[Task] 开始上传图片到WaveSpeed CDN...`);
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i].path;
        console.log(`[Task] 上传第 ${i + 1}/${files.length} 张图片: ${filePath}`);
        const cdnUrl = await wavespeed.uploadImage(filePath);
        cdnUrls.push(cdnUrl);
      }
      console.log(`[Task] 所有图片上传完成: ${JSON.stringify(cdnUrls.map(u => u?.slice(0, 60) + '...'))}`);
    } catch (uploadErr) {
      const errorMsg = uploadErr.response?.data?.message || uploadErr.message;
      console.error(`[Task] 图片上传CDN失败: ${errorMsg}`);
      run('UPDATE tasks SET status = ?, error = ? WHERE id = ?', ['failed', '图片上传失败: ' + errorMsg, taskId]);
      return res.status(500).json({ error: '图片上传失败: ' + errorMsg });
    }

    // 调用WaveSpeed API - 使用CDN公网URL
    try {
      console.log(`[Task] 开始调用WaveSpeed图生图API...`);
      const apiResult = await wavespeed.imageToImage({
        prompt,
        images: cdnUrls,
        aspect_ratio: finalAspectRatio,
        resolution: finalResolution,
        output_format: finalOutputFormat,
        enable_web_search: enable_web_search || false,
        enable_image_search: enable_image_search || false
      });

      const requestId = apiResult.data?.id;
      console.log(`[Task] WaveSpeed API返回成功: requestId=${requestId}, 耗时=${Date.now() - startTime}ms`);
      run('UPDATE tasks SET request_id = ? WHERE id = ?', [requestId, taskId]);
      console.log(`[Task] 任务 ${taskId} 已绑定 requestId=${requestId}, 开始轮询`);

      pollTaskResult(taskId, requestId);

      res.json({
        message: '任务已提交',
        taskId,
        requestId
      });
    } catch (apiErr) {
      const errorMsg = apiErr.response?.data?.message || apiErr.message;
      console.error(`[Task] WaveSpeed API调用失败: taskId=${taskId}, 错误: ${errorMsg}`);
      console.error(`[Task] API错误详情: status=${apiErr.response?.status}, data=${JSON.stringify(apiErr.response?.data || {})}`);
      run('UPDATE tasks SET status = ?, error = ? WHERE id = ?', ['failed', errorMsg, taskId]);
      res.status(500).json({ error: 'API调用失败: ' + errorMsg });
    }
  } catch (err) {
    console.error(`[Task] 图生图任务创建异常: ${err.message}`, err.stack);
    res.status(500).json({ error: '创建任务失败: ' + err.message });
  }
});

// 轮询任务结果
function pollTaskResult(taskId, requestId) {
  if (!requestId) {
    console.warn(`[Poll] 任务 ${taskId} 无requestId, 跳过轮询`);
    return;
  }

  const maxAttempts = 120;
  let attempts = 0;
  console.log(`[Poll] 开始轮询: taskId=${taskId}, requestId=${requestId}, 最大尝试=${maxAttempts}次, 间隔5秒`);

  const interval = setInterval(async () => {
    attempts++;
    console.log(`[Poll] 第 ${attempts}/${maxAttempts} 次轮询: taskId=${taskId}, requestId=${requestId}`);

    if (attempts > maxAttempts) {
      clearInterval(interval);
      console.error(`[Poll] 轮询超时: taskId=${taskId}, 已尝试 ${maxAttempts} 次`);
      run('UPDATE tasks SET status = ?, error = ? WHERE id = ?', ['failed', '任务超时', taskId]);
      return;
    }

    try {
      const result = await wavespeed.getTaskResult(requestId);
      const remoteStatus = result.data?.status;
      console.log(`[Poll] 轮询结果: taskId=${taskId}, 远程状态=${remoteStatus}`);

      if (remoteStatus === 'completed') {
        clearInterval(interval);
        const outputs = result.data.outputs || [];
        const inferenceTime = result.data.timings?.inference || null;
        console.log(`[Poll] 任务完成: taskId=${taskId}, 输出图片=${outputs.length}张, 推理耗时=${inferenceTime}ms`);
        console.log(`[Poll] 输出图片URL: ${JSON.stringify(outputs)}`);
        run(
          'UPDATE tasks SET status = ?, output_images = ?, inference_time = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['completed', JSON.stringify(outputs), inferenceTime, taskId]
        );

        // 下载输出图片到本地
        if (outputs.length > 0) {
          downloadOutputImages(taskId, outputs);
        }
      } else if (remoteStatus === 'failed') {
        clearInterval(interval);
        const errMsg = result.data.error || '生成失败';
        console.error(`[Poll] 任务失败: taskId=${taskId}, 错误: ${errMsg}`);
        run('UPDATE tasks SET status = ?, error = ? WHERE id = ?',
          ['failed', errMsg, taskId]);
      } else {
        console.log(`[Poll] 任务仍在处理中: taskId=${taskId}, 状态=${remoteStatus}`);
      }
    } catch (err) {
      console.error(`[Poll] 轮询异常: taskId=${taskId}, 第${attempts}次, 错误: ${err.message}`);
      // 继续轮询
    }
  }, 5000);
}

// 下载输出图片到本地
async function downloadOutputImages(taskId, urls) {
  const axios = require('axios');
  const outputDir = path.join(config.UPLOAD_DIR, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[Download] 开始下载输出图片: taskId=${taskId}, 共${urls.length}张`);
  const localUrls = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      console.log(`[Download] 下载第 ${i + 1}/${urls.length} 张: ${url.slice(0, 100)}...`);
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const ext = url.endsWith('.jpg') || url.endsWith('.jpeg') ? '.jpg' : '.png';
      const filename = `${taskId}-${Date.now()}${ext}`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, response.data);
      localUrls.push(`/uploads/output/${filename}`);
      console.log(`[Download] 第 ${i + 1} 张下载成功: ${filename}, 大小=${(response.data.length / 1024).toFixed(1)}KB`);
    } catch (err) {
      console.error(`[Download] 第 ${i + 1} 张下载失败: ${err.message}, 降级使用原始URL`);
      localUrls.push(url); // 降级使用原始URL
    }
  }

  console.log(`[Download] 图片下载完成: taskId=${taskId}, 本地路径=${JSON.stringify(localUrls)}`);
  run('UPDATE tasks SET output_images = ? WHERE id = ?', [JSON.stringify(localUrls), taskId]);
}

// 获取任务列表
router.get('/', authMiddleware, (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, type } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.id];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }
    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    const total = queryOne(`SELECT COUNT(*) as count FROM tasks ${whereClause}`, params);
    const tasks = queryAll(
      `SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      tasks,
      total: total.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 管理员：获取所有任务（必须在 /:id 之前，否则 all-tasks 会被当作 :id 匹配）
router.get('/all-tasks', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, type, userId, search } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }
    if (type) {
      whereClause += ' AND t.type = ?';
      params.push(type);
    }
    if (userId) {
      whereClause += ' AND t.user_id = ?';
      params.push(parseInt(userId));
    }
    if (search) {
      whereClause += ' AND t.prompt LIKE ?';
      params.push(`%${search}%`);
    }

    const total = queryOne(
      `SELECT COUNT(*) as count FROM tasks t ${whereClause}`,
      params
    );

    const tasks = queryAll(
      `SELECT t.*, u.username FROM tasks t LEFT JOIN users u ON t.user_id = u.id ${whereClause} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      tasks,
      total: total.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 获取任务详情（管理员可查看所有任务）
router.get('/:id', authMiddleware, (req, res) => {
  try {
    let task;
    if (req.user.role === 'admin') {
      task = queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    } else {
      task = queryOne('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    }
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    // 附加用户名（管理员查看时需要）
    if (task.user_id) {
      const user = queryOne('SELECT username FROM users WHERE id = ?', [task.user_id]);
      task.username = user?.username || '';
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

// 手动查询任务状态（管理员可查询所有任务）
router.post('/:id/check', authMiddleware, async (req, res) => {
  try {
    let task;
    if (req.user.role === 'admin') {
      task = queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    } else {
      task = queryOne('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    }
    if (!task) {
      console.warn(`[Check] 任务不存在: id=${req.params.id}, userId=${req.user.id}`);
      return res.status(404).json({ error: '任务不存在' });
    }
    if (!task.request_id) {
      console.warn(`[Check] 任务无关联API请求: id=${task.id}`);
      return res.status(400).json({ error: '任务没有关联的API请求' });
    }
    if (task.status === 'completed' || task.status === 'failed') {
      console.log(`[Check] 任务已终态: id=${task.id}, status=${task.status}`);
      return res.json(task);
    }

    console.log(`[Check] 手动查询任务状态: id=${task.id}, requestId=${task.request_id}, 当前状态=${task.status}`);
    const result = await wavespeed.getTaskResult(task.request_id);
    const remoteStatus = result.data?.status;
    console.log(`[Check] 远程状态: ${remoteStatus}`);

    if (remoteStatus === 'completed') {
      const outputs = result.data.outputs || [];
      const inferenceTime = result.data.timings?.inference || null;
      console.log(`[Check] 任务完成: id=${task.id}, 输出=${outputs.length}张, 推理=${inferenceTime}ms`);
      run(
        'UPDATE tasks SET status = ?, output_images = ?, inference_time = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', JSON.stringify(outputs), inferenceTime, task.id]
      );
      if (outputs.length > 0) {
        await downloadOutputImages(task.id, outputs);
      }
      const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [task.id]);
      return res.json(updatedTask);
    } else if (remoteStatus === 'failed') {
      const errMsg = result.data.error || '生成失败';
      console.error(`[Check] 任务失败: id=${task.id}, 错误: ${errMsg}`);
      run('UPDATE tasks SET status = ?, error = ? WHERE id = ?',
        ['failed', errMsg, task.id]);
      const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [task.id]);
      return res.json(updatedTask);
    }

    console.log(`[Check] 任务仍在处理中: id=${task.id}, 远程状态=${remoteStatus}`);
    res.json(task);
  } catch (err) {
    console.error(`[Check] 查询任务状态异常: id=${req.params.id}, 错误: ${err.message}`);
    res.status(500).json({ error: '查询任务状态失败: ' + err.message });
  }
});

// 删除任务
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const task = queryOne('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: '任务已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除任务失败' });
  }
});

module.exports = router;
