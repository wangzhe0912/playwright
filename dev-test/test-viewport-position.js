#!/usr/bin/env node
/**
 * 测试脚本：验证 aria_snapshot AI 模式下的视口位置标记功能
 * 
 * 此脚本会:
 * 1. 使用本地构建的 Playwright
 * 2. 创建一个包含多个元素的测试页面
 * 3. 验证 aria_snapshot 输出中包含 [visible] 和 [offscreen:xxx] 标记
 * 4. 滚动页面后验证标记变化
 * 5. 测试 iframe 场景：iframe 在视口外时，内部元素应继承 offscreen 状态
 * 
 * 注意: 视口位置标记只在 AI 模式下启用，需要使用内部 _snapshotForAI() 方法
 */

const { chromium } = require('../packages/playwright-core');

async function testBasicViewportPosition(page) {
  console.log('\n' + '='.repeat(70));
  console.log('测试 1: 基本视口位置标记');
  console.log('='.repeat(70));
  
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

  console.log('\n[1] 获取初始状态 aria_snapshot...');
  const snapshot1 = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  
  console.log('--- 初始状态 aria_snapshot 输出 ---');
  console.log(snapshot1);
  console.log('--- 输出结束 ---\n');
  
  const hasVisibleMarker = snapshot1.includes('[visible]');
  const hasOffscreenMarker = snapshot1.includes('[offscreen:');
  
  console.log('[2] 验证视口位置标记...');
  console.log(`    包含 [visible] 标记: ${hasVisibleMarker ? '✅ 是' : '❌ 否'}`);
  console.log(`    包含 [offscreen:xxx] 标记: ${hasOffscreenMarker ? '✅ 是' : '❌ 否'}`);
  
  // 滚动到页面底部
  console.log('\n[3] 滚动页面到底部...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  
  const snapshot2 = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  
  console.log('--- 滚动后 aria_snapshot 输出 ---');
  console.log(snapshot2);
  console.log('--- 输出结束 ---\n');
  
  const hasAboveMarker = snapshot2.includes('[offscreen:above]');
  console.log('[4] 验证滚动后标记变化...');
  console.log(`    包含 [offscreen:above] 标记: ${hasAboveMarker ? '✅ 是' : '❌ 否'}`);
  
  return { hasVisibleMarker, hasOffscreenMarker, hasAboveMarker };
}

async function testIframeViewportPosition(page) {
  console.log('\n' + '='.repeat(70));
  console.log('测试 2: iframe 视口位置标记（重点测试）');
  console.log('='.repeat(70));
  
  // 先滚动回顶部，重置状态
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  
  // 创建包含 iframe 的页面
  // - 一个 iframe 在视口内
  // - 一个 iframe 在视口外（offscreen:below）
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; }
        h1 { margin: 10px 0; }
        .section { margin: 20px 0; padding: 10px; border: 2px solid #333; }
        .visible-section { background: #90EE90; }
        .offscreen-section { margin-top: 800px; background: #FFB6C1; }
        iframe { border: 2px solid blue; }
      </style>
    </head>
    <body>
      <h1>iframe 视口位置测试</h1>
      
      <div class="section visible-section">
        <h2>可见区域的 iframe</h2>
        <iframe id="visible-iframe" srcdoc="
          <!DOCTYPE html>
          <html>
          <body style='margin:10px;'>
            <button id='iframe-btn1'>iframe内可见按钮</button>
            <a href='/iframe-link1'>iframe内可见链接</a>
          </body>
          </html>
        " width="300" height="100"></iframe>
      </div>
      
      <div class="section offscreen-section">
        <h2>视口下方的 iframe</h2>
        <iframe id="offscreen-iframe" srcdoc="
          <!DOCTYPE html>
          <html>
          <body style='margin:10px;'>
            <button id='iframe-btn2'>iframe内应该offscreen的按钮</button>
            <a href='/iframe-link2'>iframe内应该offscreen的链接</a>
            <input type='text' placeholder='iframe内输入框' />
          </body>
          </html>
        " width="300" height="100"></iframe>
      </div>
    </body>
    </html>
  `);

  // 等待 iframe 加载
  await page.waitForTimeout(500);

  console.log('\n[1] 获取包含 iframe 的页面快照...');
  
  // 使用 page._snapshotForAI 获取包含 iframe 内容的完整快照
  const snapshotResult = await page._snapshotForAI();
  const snapshot1 = snapshotResult.full;  // _snapshotForAI 返回 { full: string, ... }
  
  console.log('--- 初始状态 aria_snapshot 输出（包含 iframe）---');
  console.log(snapshot1);
  console.log('--- 输出结束 ---\n');
  
  // 分析 iframe 内元素的视口位置标记
  console.log('[2] 分析 iframe 内元素的视口位置标记...\n');
  
  // 检查可见 iframe 内的元素是否标记为 [visible]
  const visibleIframeBtn = snapshot1.includes('iframe内可见按钮');
  const hasVisibleInVisibleIframe = /iframe内可见按钮[^\n]*\[visible\]/.test(snapshot1);
  
  // 检查 offscreen iframe 内的元素是否标记为 [offscreen:below]
  const offscreenIframeBtn = snapshot1.includes('iframe内应该offscreen的按钮');
  const hasOffscreenInOffscreenIframe = /iframe内应该offscreen的按钮[^\n]*\[offscreen:below\]/.test(snapshot1);
  
  // 检查 offscreen iframe 本身是否标记为 [offscreen:below]
  const iframeOffscreenMarker = /iframe[^\n]*\[offscreen:below\]/.test(snapshot1);
  
  console.log('   检查结果:');
  console.log(`   - 可见 iframe 内按钮存在: ${visibleIframeBtn ? '✅' : '❌'}`);
  console.log(`   - 可见 iframe 内按钮标记为 [visible]: ${hasVisibleInVisibleIframe ? '✅' : '❌'}`);
  console.log(`   - offscreen iframe 内按钮存在: ${offscreenIframeBtn ? '✅' : '❌'}`);
  console.log(`   - offscreen iframe 本身标记为 [offscreen:below]: ${iframeOffscreenMarker ? '✅' : '❌'}`);
  console.log(`   - offscreen iframe 内按钮继承 [offscreen:below]: ${hasOffscreenInOffscreenIframe ? '✅' : '❌'} (这是本次修复的重点)`);
  
  // 滚动到页面底部，使之前可见的 iframe 变成 offscreen:above
  console.log('\n[3] 滚动到页面底部...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  
  const snapshotResult2 = await page._snapshotForAI();
  const snapshot2 = snapshotResult2.full;
  
  console.log('--- 滚动后 aria_snapshot 输出 ---');
  console.log(snapshot2);
  console.log('--- 输出结束 ---\n');
  
  // 检查滚动后，原本可见的 iframe 内元素是否变成 offscreen:above
  const hasAboveInPreviousVisibleIframe = /iframe内可见按钮[^\n]*\[offscreen:above\]/.test(snapshot2);
  // 检查原本 offscreen:below 的 iframe 内元素是否变成 visible
  const hasBecomeVisibleInPreviousOffscreenIframe = /iframe内应该offscreen的按钮[^\n]*\[visible\]/.test(snapshot2);
  
  console.log('[4] 验证滚动后标记变化...');
  console.log(`   - 原可见 iframe 内按钮变为 [offscreen:above]: ${hasAboveInPreviousVisibleIframe ? '✅' : '❌'}`);
  console.log(`   - 原 offscreen iframe 内按钮变为 [visible]: ${hasBecomeVisibleInPreviousOffscreenIframe ? '✅' : '❌'}`);
  
  return {
    visibleIframeBtn,
    hasVisibleInVisibleIframe,
    offscreenIframeBtn,
    iframeOffscreenMarker,
    hasOffscreenInOffscreenIframe,
    hasAboveInPreviousVisibleIframe,
    hasBecomeVisibleInPreviousOffscreenIframe
  };
}

async function testNestedIframeViewportPosition(page) {
  console.log('\n' + '='.repeat(70));
  console.log('测试 3: 嵌套 iframe 视口位置标记');
  console.log('='.repeat(70));
  
  // 先滚动回顶部，重置状态
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  
  // 创建包含嵌套 iframe 的页面
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; }
        .offscreen-area { margin-top: 800px; padding: 20px; background: #FFB6C1; }
        iframe { border: 2px solid blue; }
      </style>
    </head>
    <body>
      <h1>嵌套 iframe 测试</h1>
      
      <div class="offscreen-area">
        <h2>视口下方的外层 iframe</h2>
        <iframe id="outer-iframe" srcdoc="
          <!DOCTYPE html>
          <html>
          <body style='margin:10px; background:#E0E0E0;'>
            <h3>外层 iframe 内容</h3>
            <button id='outer-btn'>外层iframe按钮</button>
            <iframe id='inner-iframe' srcdoc='
              <!DOCTYPE html>
              <html>
              <body style=&quot;margin:5px; background:#FFFACD;&quot;>
                <button id=&quot;inner-btn&quot;>内层iframe按钮</button>
                <a href=&quot;/inner-link&quot;>内层iframe链接</a>
              </body>
              </html>
            ' width='200' height='80'></iframe>
          </body>
          </html>
        " width="350" height="200"></iframe>
      </div>
    </body>
    </html>
  `);

  // 等待嵌套 iframe 加载
  await page.waitForTimeout(1000);

  console.log('\n[1] 获取包含嵌套 iframe 的页面快照...');
  
  const snapshotResult = await page._snapshotForAI();
  const snapshot = snapshotResult.full;
  
  console.log('--- 嵌套 iframe aria_snapshot 输出 ---');
  console.log(snapshot);
  console.log('--- 输出结束 ---\n');
  
  // 检查嵌套 iframe 内的元素是否正确继承 offscreen 状态
  const outerBtnExists = snapshot.includes('外层iframe按钮');
  const innerBtnExists = snapshot.includes('内层iframe按钮');
  const outerBtnOffscreen = /外层iframe按钮[^\n]*\[offscreen:below\]/.test(snapshot);
  const innerBtnOffscreen = /内层iframe按钮[^\n]*\[offscreen:below\]/.test(snapshot);
  
  console.log('[2] 分析嵌套 iframe 内元素的视口位置标记...');
  console.log(`   - 外层 iframe 按钮存在: ${outerBtnExists ? '✅' : '❌'}`);
  console.log(`   - 外层 iframe 按钮标记为 [offscreen:below]: ${outerBtnOffscreen ? '✅' : '❌'}`);
  console.log(`   - 内层 iframe 按钮存在: ${innerBtnExists ? '✅' : '❌'}`);
  console.log(`   - 内层 iframe 按钮继承 [offscreen:below]: ${innerBtnOffscreen ? '✅' : '❌'} (嵌套继承测试)`);
  
  return {
    outerBtnExists,
    innerBtnExists,
    outerBtnOffscreen,
    innerBtnOffscreen
  };
}

async function testPartiallyVisibleIframe(page) {
  console.log('\n' + '='.repeat(70));
  console.log('测试 4: iframe 部分可见但内部元素不可见的边缘情况');
  console.log('='.repeat(70));
  
  // 先滚动回顶部，重置状态
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  
  // 创建一个 iframe，让它的顶部刚好在视口边缘
  // iframe 高度 300px，内部元素在 iframe 中间位置（距离顶部 100px）
  // 当页面滚动到让 iframe 顶部刚露出 50px 时，内部元素实际上还看不见
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; height: 2000px; }
        h1 { margin: 10px 0; }
        .spacer { height: 500px; background: #f0f0f0; }
        iframe { border: 2px solid blue; display: block; }
      </style>
    </head>
    <body>
      <h1>边缘情况测试</h1>
      <div class="spacer">占位区域</div>
      <iframe id="test-iframe" srcdoc="
        <!DOCTYPE html>
        <html>
        <body style='margin:0; padding:0; height:300px;'>
          <div style='height:150px; background:#f5f5f5;'>顶部空白区域</div>
          <button id='middle-btn' style='display:block; margin:20px;'>中间位置的按钮</button>
          <div style='height:100px; background:#e0e0e0;'>底部区域</div>
        </body>
        </html>
      " width="400" height="300"></iframe>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  // 滚动页面，让 iframe 刚好露出顶部 50px (视口高度600，spacer 500px + iframe开始)
  // 滚动到位置：500 - 600 + 50 = -50，这意味着需要滚动到 500 - 50 = 450px 处
  // 不对，让我重新计算：
  // - 视口高度：600px
  // - spacer 顶部：约 40px (h1 + 一些 margin)
  // - spacer 高度：500px
  // - iframe 顶部位置：约 540px
  // - 要让 iframe 露出 50px，需要滚动到：540 - 600 + 50 = -10，不需要滚动
  // 实际上让我们滚动到 iframe 刚进入视口的位置
  
  console.log('\n[1] 滚动页面，让 iframe 部分进入视口（只露出顶部边缘）...');
  // 滚动到让 iframe 的顶部刚好进入视口底部（只露出一点点）
  await page.evaluate(() => {
    const iframe = document.querySelector('#test-iframe');
    const rect = iframe.getBoundingClientRect();
    const iframeTop = rect.top + window.scrollY;
    // 滚动到让 iframe 顶部刚好在视口底部位置，再往上滚一点让它露出 30px
    window.scrollTo(0, iframeTop - window.innerHeight + 30);
  });
  await page.waitForTimeout(300);

  console.log('[2] 获取 frame 快照...');
  const frames = page.frames();
  let iframeSnapshot = '';
  
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    if (!frame.url() || frame.url() === 'about:blank') continue;
    
    try {
      iframeSnapshot = await frame.locator('body').ariaSnapshot({ mode: 'ai' });
      console.log('--- iframe 内容快照 ---');
      console.log(iframeSnapshot);
      console.log('--- 结束 ---\n');
    } catch (e) {
      console.log(`Frame 获取失败: ${e.message}`);
    }
  }

  // 检查：iframe 部分可见，但内部按钮应该是 offscreen:below（因为按钮在 iframe 中间，还没滚动到）
  const btnOffscreen = /中间位置的按钮[^\n]*\[offscreen:below\]/.test(iframeSnapshot);
  const btnVisible = /中间位置的按钮[^\n]*\[visible\]/.test(iframeSnapshot);
  
  console.log('[3] 分析边缘情况结果...');
  console.log(`   - iframe 部分可见时，内部按钮应为 offscreen: ${btnOffscreen ? '✅' : '❌'}`);
  console.log(`   - 内部按钮没有被错误标记为 visible: ${!btnVisible ? '✅' : '❌'}`);

  // 继续滚动，让按钮真正可见
  console.log('\n[4] 继续滚动，让 iframe 内的按钮真正进入视口...');
  await page.evaluate(() => {
    const iframe = document.querySelector('#test-iframe');
    const rect = iframe.getBoundingClientRect();
    const iframeTop = rect.top + window.scrollY;
    // 滚动到让 iframe 的中间部分可见
    window.scrollTo(0, iframeTop - window.innerHeight / 2);
  });
  await page.waitForTimeout(300);

  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    if (!frame.url() || frame.url() === 'about:blank') continue;
    
    try {
      iframeSnapshot = await frame.locator('body').ariaSnapshot({ mode: 'ai' });
      console.log('--- 滚动后 iframe 内容快照 ---');
      console.log(iframeSnapshot);
      console.log('--- 结束 ---\n');
    } catch (e) {
      console.log(`Frame 获取失败: ${e.message}`);
    }
  }

  const btnVisibleAfterScroll = /中间位置的按钮[^\n]*\[visible\]/.test(iframeSnapshot);
  console.log('[5] 验证滚动后按钮变为可见...');
  console.log(`   - 按钮现在标记为 visible: ${btnVisibleAfterScroll ? '✅' : '❌'}`);

  return {
    btnOffscreenWhenPartial: btnOffscreen,
    btnNotWronglyVisible: !btnVisible,
    btnVisibleAfterScroll
  };
}

async function testLocatorAriaSnapshotAPI(page) {
  console.log('\n' + '='.repeat(70));
  console.log('测试 5: 使用 locator.ariaSnapshot(mode="ai") API 遍历 frames');
  console.log('（模拟用户实际使用模式）');
  console.log('='.repeat(70));
  
  // 先滚动回顶部，重置状态
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  
  // 创建包含 iframe 的页面
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; }
        .visible-section { background: #90EE90; padding: 20px; margin: 20px 0; }
        .offscreen-section { margin-top: 800px; background: #FFB6C1; padding: 20px; }
        iframe { border: 2px solid blue; }
      </style>
    </head>
    <body>
      <h1>Locator API 测试</h1>
      
      <div class="visible-section">
        <h2>可见区域的 iframe</h2>
        <iframe id="visible-iframe" srcdoc="
          <!DOCTYPE html>
          <html>
          <body style='margin:10px;'>
            <button id='btn1'>可见iframe按钮</button>
          </body>
          </html>
        " width="300" height="80"></iframe>
      </div>
      
      <div class="offscreen-section">
        <h2>视口下方的 iframe</h2>
        <iframe id="offscreen-iframe" srcdoc="
          <!DOCTYPE html>
          <html>
          <body style='margin:10px;'>
            <button id='btn2'>offscreen-iframe按钮</button>
          </body>
          </html>
        " width="300" height="80"></iframe>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  console.log('\n[1] 使用 locator.ariaSnapshot(mode="ai") 获取主页面快照...');
  const mainSnapshot = await page.locator('body').ariaSnapshot({ mode: 'ai' });
  console.log('--- 主页面快照 ---');
  console.log(mainSnapshot);
  console.log('--- 结束 ---\n');

  console.log('[2] 遍历 frames 并获取各 frame 的快照...');
  const frames = page.frames();
  const frameSnapshots = [];
  
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    if (!frame.url() || frame.url() === 'about:blank') continue;
    
    try {
      const frameSnapshot = await frame.locator('body').ariaSnapshot({ mode: 'ai' });
      console.log(`--- Frame [${frame.url().substring(0, 50)}...] 快照 ---`);
      console.log(frameSnapshot);
      console.log('--- 结束 ---\n');
      frameSnapshots.push(frameSnapshot);
    } catch (e) {
      console.log(`Frame 获取失败: ${e.message}`);
    }
  }

  console.log('[3] 分析结果...');
  
  // 检查主页面中 offscreen iframe 是否标记正确
  const mainHasOffscreenIframe = /iframe[^\n]*\[offscreen:below\]/.test(mainSnapshot);
  
  // 检查第一个 frame (可见 iframe) 的内容是否标记为 visible
  const visibleFrameSnapshot = frameSnapshots[0] || '';
  const visibleFrameHasVisible = /可见iframe按钮[^\n]*\[visible\]/.test(visibleFrameSnapshot);
  
  // 检查第二个 frame (offscreen iframe) 的内容是否继承了 offscreen 状态
  const offscreenFrameSnapshot = frameSnapshots[1] || '';
  const offscreenFrameInheritsOffscreen = /offscreen-iframe按钮[^\n]*\[offscreen:below\]/.test(offscreenFrameSnapshot);
  // 确保它没有被错误标记为 visible
  const offscreenFrameWronglyVisible = /offscreen-iframe按钮[^\n]*\[visible\]/.test(offscreenFrameSnapshot);
  
  console.log('   检查结果:');
  console.log(`   - 主页面 offscreen iframe 标记为 [offscreen:below]: ${mainHasOffscreenIframe ? '✅' : '❌'}`);
  console.log(`   - 可见 frame 内按钮标记为 [visible]: ${visibleFrameHasVisible ? '✅' : '❌'}`);
  console.log(`   - offscreen frame 内按钮继承 [offscreen:below]: ${offscreenFrameInheritsOffscreen ? '✅' : '❌'} ⭐⭐ (关键测试)`);
  console.log(`   - offscreen frame 内按钮未被错误标记为 [visible]: ${!offscreenFrameWronglyVisible ? '✅' : '❌'}`);
  
  return {
    mainHasOffscreenIframe,
    visibleFrameHasVisible,
    offscreenFrameInheritsOffscreen,
    offscreenFrameWronglyVisible
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Playwright aria_snapshot 视口位置标记功能测试 (AI 模式)');
  console.log('包含 iframe 视口位置继承测试');
  console.log('='.repeat(70));
  
  console.log('\n[启动] 启动 Chromium 浏览器...');
  const browser = await chromium.launch({
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 }
  });
  
  const page = await context.newPage();
  
  // 运行各测试
  const basicResults = await testBasicViewportPosition(page);
  const iframeResults = await testIframeViewportPosition(page);
  const nestedResults = await testNestedIframeViewportPosition(page);
  const partialResults = await testPartiallyVisibleIframe(page);
  const locatorApiResults = await testLocatorAriaSnapshotAPI(page);
  
  // 关闭浏览器
  console.log('\n[关闭] 关闭浏览器...');
  await browser.close();
  
  // 汇总测试结果
  console.log('\n' + '='.repeat(70));
  console.log('测试结果汇总');
  console.log('='.repeat(70));
  
  console.log('\n📋 基本视口位置测试:');
  console.log(`   - [visible] 标记: ${basicResults.hasVisibleMarker ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - [offscreen:below] 标记: ${basicResults.hasOffscreenMarker ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - [offscreen:above] 标记 (滚动后): ${basicResults.hasAboveMarker ? '✅ 通过' : '❌ 失败'}`);
  
  console.log('\n📋 iframe 视口位置测试 (本次修复重点):');
  console.log(`   - 可见 iframe 内元素标记为 [visible]: ${iframeResults.hasVisibleInVisibleIframe ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - offscreen iframe 本身标记为 [offscreen:below]: ${iframeResults.iframeOffscreenMarker ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - offscreen iframe 内元素继承 [offscreen:below]: ${iframeResults.hasOffscreenInOffscreenIframe ? '✅ 通过' : '❌ 失败'} ⭐`);
  console.log(`   - 滚动后 iframe 内元素标记正确更新: ${iframeResults.hasAboveInPreviousVisibleIframe && iframeResults.hasBecomeVisibleInPreviousOffscreenIframe ? '✅ 通过' : '❌ 失败'}`);
  
  console.log('\n📋 嵌套 iframe 视口位置测试:');
  console.log(`   - 外层 iframe 内元素继承 [offscreen:below]: ${nestedResults.outerBtnOffscreen ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - 内层 iframe 内元素继承 [offscreen:below]: ${nestedResults.innerBtnOffscreen ? '✅ 通过' : '❌ 失败'} ⭐`);
  
  console.log('\n📋 iframe 部分可见边缘情况测试:');
  console.log(`   - iframe 部分可见时内部按钮为 offscreen: ${partialResults.btnOffscreenWhenPartial ? '✅ 通过' : '❌ 失败'} ⭐⭐⭐`);
  console.log(`   - 内部按钮没有被错误标记为 visible: ${partialResults.btnNotWronglyVisible ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - 滚动后按钮变为 visible: ${partialResults.btnVisibleAfterScroll ? '✅ 通过' : '❌ 失败'}`);
  
  console.log('\n📋 Locator API 测试 (用户实际使用模式):');
  console.log(`   - 主页面 offscreen iframe 标记正确: ${locatorApiResults.mainHasOffscreenIframe ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - 可见 frame 内元素标记为 [visible]: ${locatorApiResults.visibleFrameHasVisible ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   - offscreen frame 内元素继承 [offscreen:below]: ${locatorApiResults.offscreenFrameInheritsOffscreen ? '✅ 通过' : '❌ 失败'} ⭐⭐`);
  console.log(`   - 没有错误的 [visible] 标记: ${!locatorApiResults.offscreenFrameWronglyVisible ? '✅ 通过' : '❌ 失败'}`);
  
  // 判断整体测试结果
  const allBasicPassed = basicResults.hasVisibleMarker && basicResults.hasOffscreenMarker && basicResults.hasAboveMarker;
  const allIframePassed = iframeResults.hasVisibleInVisibleIframe && 
                          iframeResults.iframeOffscreenMarker && 
                          iframeResults.hasOffscreenInOffscreenIframe;
  const allNestedPassed = nestedResults.outerBtnOffscreen && nestedResults.innerBtnOffscreen;
  const allPartialPassed = partialResults.btnOffscreenWhenPartial &&
                           partialResults.btnNotWronglyVisible &&
                           partialResults.btnVisibleAfterScroll;
  const allLocatorApiPassed = locatorApiResults.mainHasOffscreenIframe &&
                              locatorApiResults.visibleFrameHasVisible &&
                              locatorApiResults.offscreenFrameInheritsOffscreen &&
                              !locatorApiResults.offscreenFrameWronglyVisible;
  
  const allPassed = allBasicPassed && allIframePassed && allNestedPassed && allPartialPassed && allLocatorApiPassed;
  
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✅ 所有测试通过！视口位置标记功能（包括 iframe 继承）工作正常！');
  } else {
    console.log('❌ 部分测试失败！');
    if (!allBasicPassed) console.log('   - 基本视口位置测试存在问题');
    if (!allIframePassed) console.log('   - iframe 视口位置测试存在问题');
    if (!allNestedPassed) console.log('   - 嵌套 iframe 视口位置测试存在问题');
    if (!allPartialPassed) console.log('   - iframe 部分可见边缘情况测试存在问题');
    if (!allLocatorApiPassed) console.log('   - Locator API 测试存在问题');
  }
  console.log('='.repeat(70));
  
  // 返回退出码
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});

