/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// @ts-ignore
import { asLocator } from 'playwright-core/lib/utils';

import { test as it, expect, unshift } from './pageTest';

async function snapshotForAI(page: any, options?: { timeout?: number, mode?: 'full' | 'incremental', track?: string }): Promise<string> {
  const snapshot = await page._snapshotForAI(options);
  return options?.mode === 'incremental' ? snapshot.incremental : snapshot.full;
}

it('should generate refs', async ({ page }) => {
  await page.setContent(`
    <button>One</button>
    <button>Two</button>
    <button>Three</button>
  `);

  const snapshot1 = await snapshotForAI(page);
  expect(snapshot1).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - button "One" [visible] [ref=e2]
      - button "Two" [visible] [ref=e3]
      - button "Three" [visible] [ref=e4]
  `);
  await expect(page.locator('aria-ref=e2')).toHaveText('One');
  await expect(page.locator('aria-ref=e3')).toHaveText('Two');
  await expect(page.locator('aria-ref=e4')).toHaveText('Three');

  await page.locator('aria-ref=e3').evaluate((e: HTMLElement) => {
    e.textContent = 'Not Two';
  });

  const snapshot2 = await snapshotForAI(page);
  expect(snapshot2).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - button "One" [visible] [ref=e2]
      - button "Not Two" [visible] [ref=e5]
      - button "Three" [visible] [ref=e4]
  `);
});

it('should list iframes', async ({ page }) => {
  await page.setContent(`
    <h1>Hello</h1>
    <iframe name="foo" src="data:text/html,<h1>World</h1>">
  `);

  const snapshot1 = await snapshotForAI(page);
  expect(snapshot1).toContain('- iframe');

  const frameSnapshot = await page.frameLocator(`iframe`).locator('body').ariaSnapshot();
  expect(frameSnapshot).toEqual('- heading "World" [level=1]');
});

it('should stitch all frame snapshots', async ({ page, server }) => {
  await page.goto(server.PREFIX + '/frames/nested-frames.html');
  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - iframe [visible] [ref=e2]:
        - generic [active] [visible] [ref=f1e1]:
          - iframe [visible] [ref=f1e2]:
            - generic [visible] [ref=f3e2]: Hi, I'm frame
          - iframe [visible] [ref=f1e3]:
            - generic [visible] [ref=f4e2]: Hi, I'm frame
      - iframe [visible] [ref=e3]:
        - generic [visible] [ref=f2e2]: Hi, I'm frame
  `);

  const href = await page.locator('aria-ref=e1').evaluate(e => e.ownerDocument.defaultView.location.href);
  expect(href).toBe(server.PREFIX + '/frames/nested-frames.html');

  const href2 = await page.locator('aria-ref=f1e2').evaluate(e => e.ownerDocument.defaultView.location.href);
  expect(href2).toBe(server.PREFIX + '/frames/two-frames.html');

  const href3 = await page.locator('aria-ref=f4e2').evaluate(e => e.ownerDocument.defaultView.location.href);
  expect(href3).toBe(server.PREFIX + '/frames/frame.html');

  {
    const { resolvedSelector } = await (page.locator('aria-ref=e1') as any)._resolveSelector();
    const sourceCode = asLocator('javascript', resolvedSelector);
    expect(sourceCode).toBe(`locator('body')`);
  }
  {
    const { resolvedSelector } = await (page.locator('aria-ref=f4e2') as any)._resolveSelector();
    const sourceCode = asLocator('javascript', resolvedSelector);
    expect(sourceCode).toBe(`locator('iframe[name="2frames"]').contentFrame().locator('iframe[name="dos"]').contentFrame().getByText('Hi, I\\'m frame')`);
  }
  {
    // Should tolerate .describe().
    const { resolvedSelector } = await (page.locator('aria-ref=f3e2').describe('foo bar') as any)._resolveSelector();
    const sourceCode = asLocator('javascript', resolvedSelector);
    expect(sourceCode).toBe(`locator('iframe[name=\"2frames\"]').contentFrame().locator('iframe[name=\"uno\"]').contentFrame().getByText('Hi, I\\'m frame')`);
  }
  {
    const error = await (page.locator('aria-ref=e1000') as any)._resolveSelector().catch(e => e);
    expect(error.message).toContain(`No element matching aria-ref=e1000`);
  }
});

it('should persist iframe references', async ({ page }) => {
  await page.setContent(`
    <ul>
      <li><iframe srcdoc="<button>button1</button>"></iframe></li>
      <li><iframe srcdoc="<button>button2</button>"></iframe></li>
    </ul>
  `);
  expect(await snapshotForAI(page)).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - iframe [visible] [ref=e4]:
          - button "button1" [visible] [ref=f1e2]
      - listitem [visible] [ref=e5]:
        - iframe [visible] [ref=e6]:
          - button "button2" [visible] [ref=f2e2]
  `);

  await page.evaluate(() => document.querySelector('iframe').remove());
  expect(await snapshotForAI(page)).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]
      - listitem [visible] [ref=e5]:
        - iframe [visible] [ref=e6]:
          - button "button2" [visible] [ref=f2e2]
  `);
  await expect(page.locator('aria-ref=f2e2')).toHaveText('button2');

  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.setAttribute('srcdoc', '<button>button1</button>');
    document.querySelector('li').appendChild(frame);
  });
  expect(await snapshotForAI(page)).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - iframe [visible] [ref=e7]:
          - button "button1" [visible] [ref=f3e2]
      - listitem [visible] [ref=e5]:
        - iframe [visible] [ref=e6]:
          - button "button2" [visible] [ref=f2e2]
  `);
  await expect(page.locator('aria-ref=f3e2')).toHaveText('button1');
  await expect(page.locator('aria-ref=f2e2')).toHaveText('button2');
});

it('should not generate refs for elements with pointer-events:none', async ({ page }) => {
  await page.setContent(`
    <button style="pointer-events: none">no-ref</button>
    <div style="pointer-events: none">
      <button style="pointer-events: auto">with-ref</button>
    </div>
    <div style="pointer-events: none">
      <div style="pointer-events: initial">
        <button>with-ref</button>
      </div>
    </div>
    <div style="pointer-events: none">
      <div style="pointer-events: auto">
        <button>with-ref</button>
      </div>
    </div>
    <div style="pointer-events: auto">
      <div style="pointer-events: none">
        <button>no-ref</button>
      </div>
    </div>
  `);

  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - button "no-ref"
      - button "with-ref" [visible] [ref=e2]
      - button "with-ref" [visible] [ref=e4]
      - button "with-ref" [visible] [ref=e6]
      - generic [visible] [ref=e7]:
        - generic:
          - button "no-ref"
  `);
});

it('emit generic roles for nodes w/o roles', async ({ page }) => {
  await page.setContent(`
    <style>
    input {
      width: 0;
      height: 0;
      opacity: 0;
    }
    </style>
    <div>
      <label>
        <span>
          <input type="radio" value="Apple" checked="">
        </span>
        <span>Apple</span>
      </label>
      <label>
        <span>
          <input type="radio" value="Pear">
        </span>
        <span>Pear</span>
      </label>
      <label>
        <span>
          <input type="radio" value="Orange">
        </span>
        <span>Orange</span>
      </label>
    </div>
  `);

  const snapshot = await snapshotForAI(page);

  expect(snapshot).toContainYaml(`
    - generic [visible] [ref=e2]:
      - generic [visible] [ref=e3]:
        - generic [visible] [ref=e4]:
          - radio "Apple" [checked]
        - text: Apple
      - generic [visible] [ref=e5]:
        - generic [visible] [ref=e6]:
          - radio "Pear"
        - text: Pear
      - generic [visible] [ref=e7]:
        - generic [visible] [ref=e8]:
          - radio "Orange"
        - text: Orange
  `);
});

it('should collapse generic nodes', async ({ page }) => {
  await page.setContent(`
    <div>
      <div>
        <div>
          <button>Button</button>
        </div>
      </div>
    </div>
  `);

  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - button \"Button\" [visible] [ref=e5]
  `);
});

it('should include cursor pointer hint', async ({ page }) => {
  await page.setContent(`
    <button style="cursor: pointer">Button</button>
  `);

  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - button \"Button\" [visible] [ref=e2] [cursor=pointer]
  `);
});

it('should not nest cursor pointer hints', async ({ page }) => {
  await page.setContent(`
    <a style="cursor: pointer" href="about:blank">
      Link with a button
      <button style="cursor: pointer">Button</button>
    </a>
  `);

  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - link \"Link with a button Button\" [visible] [ref=e2] [cursor=pointer]:
      - /url: about:blank
      - text: Link with a button
      - button "Button" [visible] [ref=e3]
  `);
});

it('should gracefully fallback when child frame cant be captured', async ({ page, server }) => {
  await page.setContent(`
    <p>Test</p>
    <iframe src="${server.PREFIX}/redirectloop1.html#depth=100000"></iframe>
  `, { waitUntil: 'domcontentloaded' });
  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - paragraph [visible] [ref=e2]: Test
      - iframe [visible] [ref=e3]
  `);
});

it('should auto-wait for navigation', async ({ page, server }) => {
  await page.goto(server.PREFIX + '/frames/frame.html');
  const [, snapshot] = await Promise.all([
    page.evaluate(() => window.location.reload()),
    snapshotForAI(page)
  ]);
  expect(snapshot).toContainYaml(`
    - generic [visible] [ref=e2]: Hi, I'm frame
  `);
});

it('should auto-wait for blocking CSS', async ({ page, server }) => {
  server.setRoute('/css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    setTimeout(() => res.end(`body { monospace }`), 1000);
  });
  await page.setContent(`
    <script src="${server.PREFIX}/css"></script>
    <p>Hello World</p>
  `, { waitUntil: 'commit' });
  expect(await snapshotForAI(page)).toContainYaml('Hello World');
});

it('should show visible children of hidden elements', { annotation: { type: 'issue', description: 'https://github.com/microsoft/playwright/issues/36296' }  }, async ({ page }) => {
  await page.setContent(`
    <div style="visibility: hidden">
      <div style="visibility: visible">
        <button>Visible</button>
      </div>
      <div style="visibility: hidden">
        <button style="visibility: visible">Visible</button>
      </div>
      <div>
        <div style="visibility: visible">
          <button style="visibility: hidden">Hidden</button>
        </div>
        <button>Hidden</button>
      </div>
    </div>
  `);

  expect(await snapshotForAI(page)).toEqual(unshift(`
    - generic [active] [visible] [ref=e1]:
      - button "Visible" [visible] [ref=e3]
      - button "Visible" [visible] [ref=e4]
  `));
});

it('should include active element information', async ({ page }) => {
  await page.setContent(`
    <button id="btn1">Button 1</button>
    <button id="btn2" autofocus>Button 2</button>
    <div>Not focusable</div>
  `);

  // Wait for autofocus to take effect
  await page.waitForFunction(() => document.activeElement?.id === 'btn2');

  const snapshot = await snapshotForAI(page);

  expect(snapshot).toContainYaml(`
    - generic [visible] [ref=e1]:
      - button "Button 1" [visible] [ref=e2]
      - button "Button 2" [active] [visible] [ref=e3]
      - generic [visible] [ref=e4]: Not focusable
  `);
});

it('should update active element on focus', async ({ page }) => {
  await page.setContent(`
    <input id="input1" placeholder="First input">
    <input id="input2" placeholder="Second input">
  `);

  // Initially there shouldn't be an active element on the inputs
  const initialSnapshot = await snapshotForAI(page);
  expect(initialSnapshot).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - textbox "First input" [visible] [ref=e2]
      - textbox "Second input" [visible] [ref=e3]
  `);

  // Focus the second input
  await page.locator('#input2').focus();

  // After focus, the second input should be active
  const afterFocusSnapshot = await snapshotForAI(page);

  expect(afterFocusSnapshot).toContainYaml(`
    - generic [visible] [ref=e1]:
      - textbox "First input" [visible] [ref=e2]
      - textbox "Second input" [active] [visible] [ref=e3]
  `);
});

it('should mark iframe as active when it contains focused element', async ({ page }) => {
  // Create a simple HTML file for the iframe
  await page.setContent(`
    <input id="regular-input" placeholder="Regular input">
    <iframe src="data:text/html,<input id='iframe-input' placeholder='Input in iframe'>" tabindex="0"></iframe>
  `);

  // Test 1: Focus the input inside the iframe
  await page.frameLocator('iframe').locator('#iframe-input').focus();
  const inputInIframeFocusedSnapshot = await snapshotForAI(page);

  // The iframe should be marked as active when it contains a focused element
  expect(inputInIframeFocusedSnapshot).toContainYaml(`
    - generic [visible] [ref=e1]:
      - textbox "Regular input" [visible] [ref=e2]
      - iframe [active] [visible] [ref=e3]:
        - textbox "Input in iframe" [active] [visible] [ref=f1e2]
  `);
});

it('return empty snapshot when iframe is not loaded', { annotation: { type: 'issue', description: 'https://github.com/microsoft/playwright/pull/36710' } }, async ({ page, server }) => {
  await page.setContent(`
    <div style="height: 5000px;">Test</div>
    <iframe loading="lazy" src="${server.PREFIX}/frame.html"></iframe>
  `);

  // Wait for the iframe to load
  await page.waitForSelector('iframe');

  // Get the snapshot of the page
  const snapshot = await snapshotForAI(page, { timeout: 100 });

  // The iframe should be present but empty
  expect(snapshot).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - generic [visible] [ref=e2]: Test
      - iframe [offscreen:below] [ref=e3]
  `);
});

it('should support many properties on iframes', async ({ page }) => {
  await page.setContent(`
    <input id="regular-input" placeholder="Regular input">
    <iframe style='cursor: pointer' src="data:text/html,<input id='iframe-input' placeholder='Input in iframe'/>" tabindex="0"></iframe>
  `);

  // Test 1: Focus the input inside the iframe
  await page.frameLocator('iframe').locator('#iframe-input').focus();
  const inputInIframeFocusedSnapshot = await snapshotForAI(page);

  expect(inputInIframeFocusedSnapshot).toContainYaml(`
    - generic [visible] [ref=e1]:
      - textbox "Regular input" [visible] [ref=e2]
      - iframe [active] [visible] [ref=e3] [cursor=pointer]:
        - textbox "Input in iframe" [active] [visible] [ref=f1e2]
  `);
});

it('should collapse inline generic nodes', async ({ page }) => {
  await page.setContent(`
    <ul>
      <li><b>3</b> <abbr>bds</abbr></li>
      <li><b>2</b> <abbr>ba</abbr></li>
      <li><b>1,200</b> <abbr>sqft</abbr></li>
    </ul>
    <ul>
      <li><div>3</div></li>
      <li><div>2</div></li>
      <li><div>1,200</div></li>
    </ul>`);

  const snapshot1 = await snapshotForAI(page);
  expect(snapshot1).toContainYaml(`
    - generic [active] [visible] [ref=e1]:
      - list [visible] [ref=e2]:
        - listitem [visible] [ref=e3]: 3 bds
        - listitem [visible] [ref=e4]: 2 ba
        - listitem [visible] [ref=e5]: 1,200 sqft
      - list [visible] [ref=e6]:
        - listitem [visible] [ref=e7]:
          - generic [visible] [ref=e8]: "3"
        - listitem [visible] [ref=e9]:
          - generic [visible] [ref=e10]: "2"
        - listitem [visible] [ref=e11]:
          - generic [visible] [ref=e12]: 1,200
  `);
});

it('should not remove generic nodes with title', async ({ page }) => {
  await page.setContent(`<div title="Element title">Element content</div>`);

  const snapshot = await snapshotForAI(page);
  expect(snapshot).toContainYaml(`
    - generic "Element title" [visible] [ref=e2]
  `);
});

it('should create incremental snapshots on multiple tracks', async ({ page }) => {
  await page.setContent(`<ul><li><button>a button</button></li><li><span>a span</span></li><li id=hidden-li style="display:none">some text</li></ul>`);

  expect(await snapshotForAI(page, { track: 'first', mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - button "a button" [visible] [ref=e4]
      - listitem [visible] [ref=e5]: a span
  `);
  expect(await snapshotForAI(page, { track: 'second', mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - button "a button" [visible] [ref=e4]
      - listitem [visible] [ref=e5]: a span
  `);
  expect(await snapshotForAI(page, { track: 'first', mode: 'incremental' })).toContainYaml(`
  `);

  await page.evaluate(() => {
    document.querySelector('span').textContent = 'changed span';
    document.getElementById('hidden-li').style.display = 'inline';
  });
  expect(await snapshotForAI(page, { track: 'first', mode: 'incremental' })).toContainYaml(`
    - <changed> list [visible] [ref=e2]:
      - ref=e3 [unchanged]
      - listitem [visible] [ref=e5]: changed span
      - listitem [visible] [ref=e6]: some text
  `);

  await page.evaluate(() => {
    document.querySelector('span').textContent = 'a span';
    document.getElementById('hidden-li').style.display = 'none';
  });
  expect(await snapshotForAI(page, { track: 'first', mode: 'incremental' })).toContainYaml(`
    - <changed> list [visible] [ref=e2]:
      - ref=e3 [unchanged]
      - listitem [visible] [ref=e5]: a span
  `);
  expect(await snapshotForAI(page, { track: 'second', mode: 'incremental' })).toContainYaml(`
  `);

  expect(await snapshotForAI(page, { track: 'second', mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - button "a button" [visible] [ref=e4]
      - listitem [visible] [ref=e5]: a span
  `);
});

it('should create incremental snapshot for attribute change', async ({ page }) => {
  await page.setContent(`<button>a button</button>`);
  await page.evaluate(() => document.querySelector('button').focus());
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - button "a button" [active] [visible] [ref=e2]
  `);

  await page.evaluate(() => document.querySelector('button').blur());
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> button "a button" [visible] [ref=e2]
  `);
});

it('should create incremental snapshot for child removal', async ({ page }) => {
  await page.setContent(`<li><button>a button</button><span>some text</span></li>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - listitem [visible] [ref=e2]:
      - button "a button" [visible] [ref=e3]
      - text: some text
  `);

  await page.evaluate(() => document.querySelector('span').remove());
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> listitem [visible] [ref=e2]:
      - ref=e3 [unchanged]
  `);
});

it('should create incremental snapshot for child addition', async ({ page }) => {
  await page.setContent(`<li><button>a button</button><span style="display:none">some text</span></li>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - listitem [visible] [ref=e2]:
      - button "a button" [visible] [ref=e3]
  `);

  await page.evaluate(() => document.querySelector('span').style.display = 'inline');
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> listitem [visible] [ref=e2]:
      - ref=e3 [unchanged]
      - text: some text
  `);
});

it('should create incremental snapshot for prop change', async ({ page }) => {
  await page.setContent(`<a href="about:blank" style="cursor:pointer">a link</a>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - link "a link" [visible] [ref=e2] [cursor=pointer]:
      - /url: about:blank
  `);

  await page.evaluate(() => document.querySelector('a').setAttribute('href', 'https://playwright.dev'));
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> link "a link" [visible] [ref=e2] [cursor=pointer]:
      - /url: https://playwright.dev
  `);
});

it('should create incremental snapshot for cursor change', async ({ page }) => {
  await page.setContent(`<a href="about:blank" style="cursor:pointer">a link</a>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - link "a link" [visible] [ref=e2] [cursor=pointer]:
      - /url: about:blank
  `);

  await page.evaluate(() => document.querySelector('a').style.cursor = 'default');
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> link "a link" [visible] [ref=e2]:
      - /url: about:blank
  `);
});

it('should create incremental snapshot for name change', async ({ page }) => {
  await page.setContent(`<button><span>a button</span></button>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - button "a button" [visible] [ref=e2]
  `);

  await page.evaluate(() => document.querySelector('span').textContent = 'new button');
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> button "new button" [visible] [ref=e3]
  `);
});

it('should create incremental snapshot for text change', async ({ page }) => {
  await page.setContent(`<li><span>an item</span></li>`);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - listitem [visible] [ref=e2]: an item
  `);

  await page.evaluate(() => document.querySelector('span').textContent = 'new text');
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> listitem [visible] [ref=e2]: new text
  `);
});

it('should produce incremental snapshot for iframes', async ({ page }) => {
  await page.setContent(`
    <iframe srcdoc="
      <li>
        <span style='display:none'>outer text</span>
        <button>a button</button>
        <iframe src='data:text/html,<li>inner text</li>' style='display:none'></iframe>
      </li>
    "></iframe>
  `);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - iframe [visible] [ref=e2]:
      - listitem [visible] [ref=f1e2]:
        - button "a button" [visible] [ref=f1e3]
  `);

  await page.frames()[1].evaluate(() => {
    document.querySelector('span').style.display = 'block';
    document.querySelector('iframe').style.display = 'block';
  });
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> listitem [visible] [ref=f1e2]:
      - generic [visible] [ref=f1e4]: outer text
      - ref=f1e3 [unchanged]
      - iframe [visible] [ref=f1e5]
    - <changed> iframe [visible] [ref=f1e5]:
      - listitem [visible] [ref=f2e2]: inner text
  `);
});

it('should create multiple chunks in incremental snapshot', async ({ page }) => {
  await page.setContent(`
    <ul>
      <li><span>item1</span></li>
      <li><span>item2</span></li>
      <li><div role=group><span>item3</span></div></li>
      <ul>
        <li id=to-remove>to be removed</li>
        <li>one more</li>
      </ul>
    </ul>
  `);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]: item1
      - listitem [visible] [ref=e4]: item2
      - listitem [visible] [ref=e5]:
        - group [visible] [ref=e6]: item3
      - list [visible] [ref=e7]:
        - listitem [visible] [ref=e8]: to be removed
        - listitem [visible] [ref=e9]: one more
  `);

  await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    spans[0].textContent = 'new item1';
    spans[2].textContent = 'new item3';
    const button = document.createElement('button');
    button.textContent = 'button';
    spans[2].parentElement.appendChild(button);
    document.querySelector('#to-remove').remove();
  });
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> listitem [visible] [ref=e3]: new item1
    - <changed> group [visible] [ref=e6]:
      - text: new item3
      - button "button" [visible] [ref=e10]
    - <changed> list [visible] [ref=e7]:
      - ref=e9 [unchanged]
  `);
});

it('should not create incremental snapshots without tracks', async ({ page }) => {
  await page.setContent(`<ul><li><button>a button</button></li><li><span>a span</span></li><li id=hidden-li style="display:none">some text</li></ul>`);

  expect(await snapshotForAI(page, { mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]:
        - button "a button" [visible] [ref=e4]
      - listitem [visible] [ref=e5]: a span
  `);
  expect(await snapshotForAI(page, { mode: 'incremental' })).toBe(undefined);
});

it('should create incremental snapshot for children swap', async ({ page }) => {
  await page.setContent(`
    <ul>
      <li>item 1</li>
      <li>item 2</li>
    </ul>
  `);
  expect(await snapshotForAI(page, { track: 'track', mode: 'full' })).toContainYaml(`
    - list [visible] [ref=e2]:
      - listitem [visible] [ref=e3]: item 1
      - listitem [visible] [ref=e4]: item 2
  `);

  await page.evaluate(() => document.querySelector('ul').appendChild(document.querySelector('li')));
  expect(await snapshotForAI(page, { track: 'track', mode: 'incremental' })).toContainYaml(`
    - <changed> list [visible] [ref=e2]:
      - ref=e4 [unchanged]
      - ref=e3 [unchanged]
  `);
});
