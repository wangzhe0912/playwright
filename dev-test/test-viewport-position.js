#!/usr/bin/env node
/**
 * 测试脚本：验证 aria_snapshot AI 模式下的视口位置标记功能
 * 
 * 此脚本会:
 * 1. 使用本地构建的 Playwright
 * 2. 创建一个包含多个元素的测试页面
 * 3. 验证 aria_snapshot 输出中包含 [visible] 和 [offscreen:xxx] 标记
 * 4. 滚动页面后验证标记变化
 * 
 * 注意: 视口位置标记只在 AI 模式下启用，需要使用内部 _snapshotForAI() 方法
 */

const { chromium } = require('../packages/playwright-core');

async function main() {
  console.log('='.repeat(70));
  console.log('Playwright aria_snapshot 视口位置标记功能测试 (AI 模式)');
  console.log('='.repeat(70));
  
  console.log('\n[1] 启动 Chromium 浏览器...');
  const browser = await chromium.launch({
    headless: true
  });
  
  console.log('[2] 创建新的浏览器上下文...');
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 }
  });
  
  console.log('[3] 创建新页面...');
  const page = await context.newPage();
  
  console.log('[4] 设置测试页面内容...');
  // 创建一个包含多个元素的页面，部分元素在视口外
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; }
        .box { 
          width: 200px; 
          height: 150px; 
          margin: 20px; 
          padding: 20px;
          border: 2px solid #333;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .visible-area { background: #90EE90; }
        .below-viewport { margin-top: 800px; background: #FFB6C1; }
        .far-below { margin-top: 200px; background: #87CEEB; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>视口位置测试页面</h1>
      
      <div class="box visible-area">
        <button id="btn1">可见按钮1</button>
      </div>
      
      <div class="box visible-area">
        <button id="btn2">可见按钮2</button>
        <a href="/link1">可见链接</a>
      </div>
      
      <div class="box below-viewport">
        <button id="btn3">视口下方按钮</button>
      </div>
      
      <div class="box far-below">
        <button id="btn4">更远的按钮</button>
        <a href="/link2">视口下方链接</a>
      </div>
    </body>
    </html>
  `);

  console.log('[5] 获取 aria_snapshot (AI 模式 - 使用公共 API 的 mode 参数)...\n');
  
  // 使用公共 API 的 mode: 'ai' 参数来获取带视口位置标记的 aria snapshot
  const snapshot1 = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  
  console.log('--- 初始状态 aria_snapshot 输出 (AI 模式) ---');
  console.log(snapshot1);
  console.log('--- 输出结束 ---\n');
  
  // 验证输出中包含 [visible] 标记
  const hasVisibleMarker = snapshot1.includes('[visible]');
  const hasOffscreenMarker = snapshot1.includes('[offscreen:');
  
  console.log('[6] 验证视口位置标记...');
  console.log(`    包含 [visible] 标记: ${hasVisibleMarker ? '✅ 是' : '❌ 否'}`);
  console.log(`    包含 [offscreen:xxx] 标记: ${hasOffscreenMarker ? '✅ 是' : '❌ 否'}`);
  
  // 滚动到页面底部
  console.log('\n[7] 滚动页面到底部...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500); // 等待滚动完成
  
  const snapshot2 = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  
  console.log('\n--- 滚动后 aria_snapshot 输出 (AI 模式) ---');
  console.log(snapshot2);
  console.log('--- 输出结束 ---\n');
  
  // 验证滚动后之前可见的元素现在应该标记为 offscreen:above
  const hasAboveMarker = snapshot2.includes('[offscreen:above]');
  console.log('[8] 验证滚动后标记变化...');
  console.log(`    包含 [offscreen:above] 标记: ${hasAboveMarker ? '✅ 是' : '❌ 否'}`);
  
  // 滚动回顶部
  console.log('\n[9] 滚动回页面顶部...');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  
  const snapshot3 = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  
  console.log('\n--- 滚动回顶部后 aria_snapshot 输出 (AI 模式) ---');
  console.log(snapshot3);
  console.log('--- 输出结束 ---\n');
  
  // 总结测试结果
  console.log('[10] 关闭浏览器...');
  await browser.close();
  
  console.log('\n' + '='.repeat(70));
  console.log('测试结果汇总:');
  console.log('='.repeat(70));
  
  const allPassed = hasVisibleMarker && hasOffscreenMarker;
  
  if (allPassed) {
    console.log('✅ 所有测试通过！视口位置标记功能工作正常！');
    console.log('\n功能说明:');
    console.log('  - [visible]         : 元素在当前浏览器视口内（至少部分可见）');
    console.log('  - [offscreen:above] : 元素完全在视口上方');
    console.log('  - [offscreen:below] : 元素完全在视口下方');
    console.log('  - [offscreen:left]  : 元素完全在视口左侧');
    console.log('  - [offscreen:right] : 元素完全在视口右侧');
    console.log('  - [offscreen:above-left] 等: 元素在视口的对角方向');
  } else {
    console.log('❌ 部分测试失败！请检查实现。');
    if (!hasVisibleMarker) console.log('   - 缺少 [visible] 标记');
    if (!hasOffscreenMarker) console.log('   - 缺少 [offscreen:xxx] 标记');
  }
  
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});

