#!/usr/bin/env node

/**
 * 授权码生成工具
 *
 * 使用方法：
 *   node generate-license.js <机器ID> [类型] [有效天数]
 *
 * 参数说明：
 *   机器ID    - 必填，目标机器的ID（格式：XXXX-XXXX-XXXX-XXXX）
 *   类型      - 可选，授权类型：standard(标准版) / professional(专业版) / enterprise(企业版)，默认 standard
 *   有效天数  - 可选，0表示永久授权，默认 0
 *
 * 示例：
 *   node generate-license.js A1B2-C3D4-E5F6-7890
 *   node generate-license.js A1B2-C3D4-E5F6-7890 professional
 *   node generate-license.js A1B2-C3D4-E5F6-7890 enterprise 365
 *   node generate-license.js A1B2-C3D4-E5F6-7890 standard 30
 */

const { generateLicenseKey, verifyLicenseKey, getTypeName } = require('./services/license');
const { getMachineId, getMachineInfo } = require('./services/machineId');

const args = process.argv.slice(2);

// 无参数时显示当前机器信息
if (args.length === 0) {
  console.log('=== AI图片处理系统 - 授权码生成工具 ===\n');
  console.log('当前机器信息：');
  const info = getMachineInfo();
  console.log(`  机器ID：${info.machineId}`);
  console.log(`  系统：${info.platform} ${info.arch}`);
  console.log(`  主机名：${info.hostname}`);
  console.log(`  CPU：${info.cpu}`);
  console.log(`  内存：${info.totalMemory}`);
  console.log(`  网卡：`);
  (info.networkInterfaces || []).forEach(n => {
    console.log(`    ${n.name}: ${n.mac}`);
  });
  console.log('\n使用方法：');
  console.log('  node generate-license.js <机器ID> [类型] [有效天数]');
  console.log('\n类型：standard(标准版) / professional(专业版) / enterprise(企业版)');
  console.log('有效天数：0=永久授权，其他数字=有效天数');
  console.log('\n示例：');
  console.log('  node generate-license.js A1B2-C3D4-E5F6-7890');
  console.log('  node generate-license.js A1B2-C3D4-E5F6-7890 professional 365');
  process.exit(0);
}

const machineId = args[0];
const type = args[1] || 'standard';
const expireDays = parseInt(args[2]) || 0;

// 验证机器ID格式
if (!/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i.test(machineId)) {
  console.error('错误：机器ID格式无效，应为 XXXX-XXXX-XXXX-XXXX 格式');
  process.exit(1);
}

// 验证类型
const validTypes = ['standard', 'professional', 'enterprise'];
if (!validTypes.includes(type)) {
  console.error(`错误：授权类型无效，可选值：${validTypes.join(' / ')}`);
  process.exit(1);
}

// 生成授权码
const licenseKey = generateLicenseKey(machineId, { type, expireDays });

// 验证授权码
const verifyResult = verifyLicenseKey(machineId, licenseKey);

console.log('=== 授权码生成成功 ===\n');
console.log(`  机器ID：${machineId}`);
console.log(`  授权类型：${getTypeName(type)}`);
console.log(`  有效期：${expireDays === 0 ? '永久' : expireDays + '天'}`);
console.log(`  过期日期：${verifyResult.expireDate}`);
console.log(`\n  授权码：${licenseKey}`);
console.log(`\n  验证结果：${verifyResult.valid ? '通过' : '失败'} - ${verifyResult.message}`);
console.log('\n请将授权码发送给用户，在系统页面中输入激活。');
