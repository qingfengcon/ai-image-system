const axios = require('axios');
const config = require('../config');
const { queryOne } = require('../db/database');

class WaveSpeedService {
  constructor() {
    this.baseUrl = config.WAVESPEED_BASE_URL;
  }

  getApiKey() {
    // 优先使用数据库中的设置
    const setting = queryOne('SELECT value FROM settings WHERE key = ?', ['wavespeed_api_key']);
    const key = (setting && setting.value) || config.WAVESPEED_API_KEY;
    console.log(`[WaveSpeed] 获取API Key: ${key ? key.slice(0, 8) + '...' : '(空)'}`);
    return key;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getApiKey()}`
    };
  }

  // 文生图
  async textToImage({ prompt, aspect_ratio, resolution, output_format, enable_web_search, enable_image_search }) {
    const payload = {
      prompt,
      enable_sync_mode: false,
      enable_base64_output: false
    };
    if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
    if (resolution) payload.resolution = resolution;
    if (output_format) payload.output_format = output_format;
    if (enable_web_search !== undefined) payload.enable_web_search = enable_web_search;
    if (enable_image_search !== undefined) payload.enable_image_search = enable_image_search;

    const url = `${this.baseUrl}/google/nano-banana-2/text-to-image`;
    console.log(`[WaveSpeed] 文生图请求 -> ${url}`);
    console.log(`[WaveSpeed] 请求参数: ${JSON.stringify({ ...payload, prompt: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : '') })}`);

    try {
      const response = await axios.post(url, payload, { headers: this.getHeaders() });
      console.log(`[WaveSpeed] 文生图完整响应: ${JSON.stringify(response.data).slice(0, 500)}`);
      console.log(`[WaveSpeed] 文生图响应: code=${response.data?.code}, status=${response.data?.data?.status}, requestId=${response.data?.data?.id}`);
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error(`[WaveSpeed] 文生图请求失败: HTTP ${status}`);
      console.error(`[WaveSpeed] 错误详情: ${JSON.stringify(data || err.message)}`);
      throw err;
    }
  }

  // 图生图
  async imageToImage({ prompt, images, aspect_ratio, resolution, output_format, enable_web_search, enable_image_search }) {
    const payload = {
      prompt,
      images,
      enable_sync_mode: false,
      enable_base64_output: false
    };
    if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
    if (resolution) payload.resolution = resolution;
    if (output_format) payload.output_format = output_format;
    if (enable_web_search !== undefined) payload.enable_web_search = enable_web_search;
    if (enable_image_search !== undefined) payload.enable_image_search = enable_image_search;

    const url = `${this.baseUrl}/google/nano-banana-2/edit`;
    console.log(`[WaveSpeed] 图生图请求 -> ${url}`);
    console.log(`[WaveSpeed] 请求参数: images=${images.length}张, aspect_ratio=${aspect_ratio}, resolution=${resolution}, prompt=${prompt.slice(0, 80)}`);

    try {
      const response = await axios.post(url, payload, { headers: this.getHeaders() });
      console.log(`[WaveSpeed] 图生图完整响应: ${JSON.stringify(response.data).slice(0, 500)}`);
      console.log(`[WaveSpeed] 图生图响应: code=${response.data?.code}, status=${response.data?.data?.status}, requestId=${response.data?.data?.id}`);
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error(`[WaveSpeed] 图生图请求失败: HTTP ${status}`);
      console.error(`[WaveSpeed] 错误详情: ${JSON.stringify(data || err.message)}`);
      throw err;
    }
  }

  // 上传图片到WaveSpeed CDN
  async uploadImage(filePath) {
    const url = `${this.baseUrl.replace('/api/v3', '')}/api/v3/media/upload/binary`;
    const fs = require('fs');
    const FormData = require('form-data');

    console.log(`[WaveSpeed] 上传图片到CDN: ${filePath}`);

    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.getApiKey()}`
        },
        maxContentLength: 20 * 1024 * 1024,
        maxBodyLength: 20 * 1024 * 1024
      });

      const downloadUrl = response.data?.data?.download_url || response.data?.data?.url;
      console.log(`[WaveSpeed] 图片上传成功: ${downloadUrl ? downloadUrl.slice(0, 80) + '...' : '(无URL)'}`);
      return downloadUrl;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error(`[WaveSpeed] 图片上传失败: HTTP ${status}`);
      console.error(`[WaveSpeed] 错误详情: ${JSON.stringify(data || err.message)}`);
      throw err;
    }
  }

  // 查询任务结果
  async getTaskResult(requestId) {
    const url = `${this.baseUrl}/predictions/${requestId}/result`;
    console.log(`[WaveSpeed] 查询任务结果 -> requestId=${requestId}, url=${url}`);

    try {
      const response = await axios.get(url, { headers: this.getHeaders() });
      const result = response.data;
      console.log(`[WaveSpeed] 查询完整响应: ${JSON.stringify(result).slice(0, 500)}`);
      console.log(`[WaveSpeed] 查询结果: status=${result.data?.status}, outputs=${result.data?.outputs?.length || 0}张, inference=${result.data?.timings?.inference}ms`);
      return result;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error(`[WaveSpeed] 查询任务结果失败: HTTP ${status}, requestId=${requestId}`);
      console.error(`[WaveSpeed] 错误详情: ${JSON.stringify(data || err.message)}`);
      throw err;
    }
  }
}

module.exports = new WaveSpeedService();
