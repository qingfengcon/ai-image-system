/**
 * 授权码生成与验证模块
 * 使用机器ID + 密钥生成授权码，支持有效期设置
 */
const crypto = require('crypto');

// 授权密钥（用于生成和验证授权码，请妥善保管）
const LICENSE_SECRET = 'AI-IMAGE-SYSTEM-LICENSE-KEY-2024-SECURE';

/**
 * 根据机器ID生成授权码
 * @param {string} machineId - 机器ID（格式：XXXX-XXXX-XXXX-XXXX）
 * @param {object} options - 选项
 * @param {number} options.expireDays - 有效天数，0表示永久
 * @param {string} options.type - 授权类型：standard/professional/enterprise
 * @returns {string} 授权码
 */
function generateLicenseKey(machineId, options = {}) {
  const { expireDays = 0, type = 'standard' } = options;

  // 计算过期时间
  let expireDate = '9999-12-31'; // 永久
  if (expireDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + expireDays);
    expireDate = d.toISOString().split('T')[0];
  }

  // 构建授权数据：机器ID + 类型 + 过期日期
  const licenseData = `${machineId}|${type}|${expireDate}`;

  // 使用HMAC-SHA256生成签名
  const signature = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(licenseData)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();

  // 编码授权码：类型代码 + 过期日期编码 + 签名
  const typeCode = { standard: 'S', professional: 'P', enterprise: 'E' }[type] || 'S';

  // 将过期日期编码为紧凑格式
  const expireCode = expireDate === '9999-12-31' ? 'PERP' : expireDate.replace(/-/g, '').substring(2); // YYMMDD

  // 最终授权码格式：TYPE-MACHINE_SUFFIX-EXPIRE-SIGNATURE
  const machineSuffix = machineId.replace(/-/g, '').substring(8); // 取机器ID后8位
  const licenseKey = `${typeCode}${machineSuffix}-${expireCode}-${signature}`;

  return licenseKey;
}

/**
 * 验证授权码
 * @param {string} machineId - 当前机器ID
 * @param {string} licenseKey - 待验证的授权码
 * @returns {object} 验证结果 { valid, type, expireDate, message }
 */
function verifyLicenseKey(machineId, licenseKey) {
  if (!machineId || !licenseKey) {
    return { valid: false, message: '机器ID或授权码不能为空' };
  }

  try {
    // 解析授权码
    const parts = licenseKey.split('-');
    if (parts.length < 3) {
      return { valid: false, message: '授权码格式无效' };
    }

    const typeCode = parts[0].charAt(0);
    const machineSuffix = parts[0].substring(1);
    const expireCode = parts[1];
    const signature = parts.slice(2).join('-'); // 签名可能包含-

    // 验证机器ID后缀匹配
    const currentSuffix = machineId.replace(/-/g, '').substring(8);
    if (machineSuffix !== currentSuffix) {
      return { valid: false, message: '授权码与当前机器不匹配' };
    }

    // 解析类型
    const typeMap = { S: 'standard', P: 'professional', E: 'enterprise' };
    const type = typeMap[typeCode];
    if (!type) {
      return { valid: false, message: '授权码类型无效' };
    }

    // 解析过期日期
    let expireDate;
    if (expireCode === 'PERP') {
      expireDate = '9999-12-31';
    } else {
      // YYMMDD -> 20YY-MM-DD
      if (expireCode.length !== 6) {
        return { valid: false, message: '授权码过期日期格式无效' };
      }
      expireDate = `20${expireCode.substring(0, 2)}-${expireCode.substring(2, 4)}-${expireCode.substring(4, 6)}`;
    }

    // 检查是否过期
    if (expireDate !== '9999-12-31') {
      const now = new Date();
      const expire = new Date(expireDate);
      if (now > expire) {
        return { valid: false, message: `授权已过期（${expireDate}）` };
      }
    }

    // 重新计算签名进行验证
    const licenseData = `${machineId}|${type}|${expireDate}`;
    const expectedSignature = crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(licenseData)
      .digest('hex')
      .substring(0, 16)
      .toUpperCase();

    if (signature !== expectedSignature) {
      return { valid: false, message: '授权码签名验证失败' };
    }

    return {
      valid: true,
      type,
      expireDate,
      message: expireDate === '9999-12-31' ? '永久授权' : `授权有效期至 ${expireDate}`
    };
  } catch (err) {
    return { valid: false, message: '授权码验证异常: ' + err.message };
  }
}

/**
 * 获取授权类型的中文名称
 */
function getTypeName(type) {
  const names = {
    standard: '标准版',
    professional: '专业版',
    enterprise: '企业版'
  };
  return names[type] || '未知';
}

module.exports = { generateLicenseKey, verifyLicenseKey, getTypeName, LICENSE_SECRET };
