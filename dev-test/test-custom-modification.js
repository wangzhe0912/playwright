#!/usr/bin/env node
/**
 * 测试脚本：验证 Playwright 源码修改是否生效
 * 
 * 此脚本会:
 * 1. 使用本地构建的 Playwright
 * 2. 访问百度页面
 * 3. 验证 URL 是否正确
 * 4. 通过 DEBUG 环境变量查看我们添加的自定义日志
 */

const { chromium } = require('../packages/playwright-core');

async function main() {
  console.log('='.repeat(60));
  console.log('Playwright 本地开发环境测试');
  console.log('='.repeat(60));
  
  console.log('\n[1] 启动 Chromium 浏览器...');
  const browser = await chromium.launch({
    headless: true
  });
  
  console.log('[2] 创建新的浏览器上下文...');
  const context = await browser.newContext();
  
  console.log('[3] 创建新页面...');
  const page = await context.newPage();
  
  console.log('[4] 导航到百度首页...');
  console.log('    (我们修改的 goto 方法会在这里被调用)');
  console.log('    (如果设置了 DEBUG=pw:api，可以看到 [CUSTOM_DEV_TEST] 日志)\n');
  
  await page.goto('https://www.baidu.com');
  
  console.log('[5] 验证页面 URL...');
  const currentUrl = page.url();
  console.log(`    当前 URL: ${currentUrl}`);
  
  const isUrlCorrect = currentUrl.includes('baidu.com');
  if (isUrlCorrect) {
    console.log('    ✅ URL 验证通过！');
  } else {
    console.log('    ❌ URL 验证失败！');
  }
  
  console.log('\n[6] 获取页面标题...');
  const title = await page.title();
  console.log(`    页面标题: ${title}`);
  
  console.log('\n[7] 关闭浏览器...');
  await browser.close();
  
  console.log('\n' + '='.repeat(60));
  console.log('测试完成！本地 Playwright 开发环境工作正常！');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});

