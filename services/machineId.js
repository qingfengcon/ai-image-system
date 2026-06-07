/**
 * 机器指纹生成模块
 * 通过收集硬件信息生成唯一的机器ID
 */
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

/**
 * 获取机器唯一标识
 * 综合多个硬件特征生成指纹
 */
function getMachineId() {
  const components = [];

  // 1. CPU信息
  try {
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      components.push(cpus[0].model);
      components.push(String(cpus.length));
    }
  } catch (e) { /* 忽略 */ }

  // 2. 主机名
  try {
    components.push(os.hostname());
  } catch (e) { /* 忽略 */ }

  // 3. 系统类型和架构
  try {
    components.push(os.type());
    components.push(os.arch());
    components.push(os.release());
  } catch (e) { /* 忽略 */ }

  // 4. 网络接口MAC地址（取第一个非空且非内部的）
  try {
    const nets = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // 排除内部地址和空MAC
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac);
        }
      }
    }
    // 排序保证一致性
    macs.sort();
    if (macs.length > 0) {
      components.push(macs[0]);
    }
  } catch (e) { /* 忽略 */ }

  // 5. Windows特定：获取磁盘序列号或主板信息
  try {
    if (process.platform === 'win32') {
      // 尝试获取BIOS序列号
      const biosSerial = execSync(
        'wmic bios get serialnumber 2>nul',
        { encoding: 'utf-8', timeout: 5000 }
      ).split('\n').filter(l => l.trim() && !l.includes('SerialNumber')).join('').trim();
      if (biosSerial) {
        components.push(biosSerial);
      }
    }
  } catch (e) { /* 忽略 */ }

  // 6. Linux/Mac特定信息
  try {
    if (process.platform === 'linux') {
      const machineId = execSync(
        'cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (machineId) {
        components.push(machineId);
      }
    } else if (process.platform === 'darwin') {
      const serial = execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk \'/IOPlatformUUID/ { gsub(/"/, "", $3); print $3 }\'',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (serial) {
        components.push(serial);
      }
    }
  } catch (e) { /* 忽略 */ }

  // 将所有组件拼接后生成SHA256哈希
  const raw = components.join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  // 取前32位作为机器ID，格式化为易读形式 XXXX-XXXX-XXXX-XXXX
  const short = hash.substring(0, 16).toUpperCase();
  return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}-${short.slice(12, 16)}`;
}

/**
 * 获取机器详细信息（用于授权码生成工具展示）
 */
function getMachineInfo() {
  const info = {
    platform: os.type(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpu: os.cpus()[0]?.model || 'Unknown',
    cpuCores: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
    machineId: getMachineId()
  };

  // 获取MAC地址
  try {
    const nets = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push({ name, mac: net.mac });
        }
      }
    }
    info.networkInterfaces = macs;
  } catch (e) { /* 忽略 */ }

  return info;
}

module.exports = { getMachineId, getMachineInfo };
