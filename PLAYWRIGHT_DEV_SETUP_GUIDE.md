# Playwright 本地开发环境搭建指南

本文档记录了如何在本地搭建 Playwright 的开发环境，并验证源码修改是否生效。

## 目录

1. [环境要求](#环境要求)
2. [搭建步骤](#搭建步骤)
3. [验证源码修改](#验证源码修改)
4. [项目结构说明](#项目结构说明)
5. [常用开发命令](#常用开发命令)
6. [问题排查](#问题排查)

---

## 环境要求

- **Node.js**: >= 18 (推荐使用 20+)
- **npm**: 随 Node.js 安装
- **Git**: 用于克隆仓库
- **操作系统**: macOS / Linux / Windows

### 检查 Node.js 版本

```bash
node --version
# 输出示例: v23.10.0
```

---

## 搭建步骤

### 1. 克隆仓库

```bash
git clone https://github.com/microsoft/playwright.git
cd playwright
```

### 2. 安装依赖

```bash
# 使用 --ignore-scripts 避免安装过程中的锁文件冲突
npm ci --ignore-scripts
```

> **注意**: 如果遇到锁文件错误，可以先删除锁文件：
> ```bash
> rm -rf ~/Library/Caches/ms-playwright/__dirlock
> ```

### 3. 构建项目

```bash
npm run build
```

构建过程会：
- 编译 TypeScript 源码
- 打包各个子包（playwright-core, playwright, html-reporter 等）
- 生成类型定义文件

### 4. 安装浏览器

```bash
# 安装 Chromium
npx playwright install chromium

# 或安装所有浏览器
npx playwright install
```

浏览器会被下载到 `~/Library/Caches/ms-playwright/` (macOS) 或相应的缓存目录。

---

## 验证源码修改

### 修改示例

我们在 `packages/playwright-core/src/server/frames.ts` 的 `goto` 方法中添加了一行日志：

```typescript
async goto(progress: Progress, url: string, options: types.GotoOptions = {}): Promise<network.Response | null> {
    // [CUSTOM_DEV_TEST] 这是一个测试修改，用于验证开发环境搭建成功
    progress.log(`[CUSTOM_DEV_TEST] goto() 被调用，目标URL: ${url}`);
    const constructedNavigationURL = constructURLBasedOnBaseURL(this._page.browserContext._options.baseURL, url);
    return this.raceNavigationAction(progress, async () => this.gotoImpl(progress, constructedNavigationURL, options));
}
```

### 重新构建

修改源码后需要重新构建：

```bash
npm run build
```

> **提示**: 开发时可以使用 `npm run watch` 来自动监视文件变化并重新构建。

### 测试脚本

创建测试脚本 `dev-test/test-custom-modification.js`：

```javascript
#!/usr/bin/env node
const { chromium } = require('../packages/playwright-core');

async function main() {
  console.log('Playwright 本地开发环境测试');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 调用 goto 方法，触发我们的修改
  await page.goto('https://www.baidu.com');
  
  // 验证 URL
  const currentUrl = page.url();
  console.log(`当前 URL: ${currentUrl}`);
  console.log(currentUrl.includes('baidu.com') ? '✅ 验证通过' : '❌ 验证失败');
  
  await browser.close();
}

main().catch(console.error);
```

### 运行测试

```bash
# 使用 DEBUG 环境变量查看详细日志
DEBUG=pw:api node dev-test/test-custom-modification.js
```

### 预期输出

```
2025-11-26T09:04:03.757Z pw:api [CUSTOM_DEV_TEST] goto() 被调用，目标URL: https://www.baidu.com
```

看到 `[CUSTOM_DEV_TEST]` 日志说明源码修改已经生效！

---

## 项目结构说明

```
playwright/
├── packages/
│   ├── playwright-core/     # 核心库（浏览器自动化 API）
│   │   ├── src/
│   │   │   ├── client/      # 客户端 API
│   │   │   ├── server/      # 服务端实现
│   │   │   └── ...
│   │   └── lib/             # 编译后的代码
│   │
│   ├── playwright/          # 测试框架包
│   ├── html-reporter/       # HTML 报告生成器
│   ├── trace-viewer/        # 追踪查看器
│   └── ...
│
├── tests/                   # 测试用例
├── docs/                    # 文档源文件
├── utils/                   # 构建和开发工具
└── examples/                # 示例项目
```

### 关键源码位置

| 功能 | 文件路径 |
|------|----------|
| Page API 客户端 | `packages/playwright-core/src/client/page.ts` |
| Frame 服务端实现 | `packages/playwright-core/src/server/frames.ts` |
| 浏览器启动 | `packages/playwright-core/src/server/browserType.ts` |
| 测试运行器 | `packages/playwright/src/runner/` |

---

## 常用开发命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建所有包 |
| `npm run watch` | 监视模式构建（自动重新编译） |
| `npm run clean` | 清理构建产物 |
| `npm run lint` | 运行代码检查 |
| `npm run tsc` | TypeScript 类型检查 |
| `npm run ctest` | 运行 Chromium 测试 |
| `npm run ftest` | 运行 Firefox 测试 |
| `npm run wtest` | 运行 WebKit 测试 |

### 调试环境变量

| 变量 | 说明 |
|------|------|
| `DEBUG=pw:api` | 显示 API 调用日志 |
| `DEBUG=pw:browser` | 显示浏览器日志 |
| `DEBUG=pw:*` | 显示所有调试日志 |
| `PWDEBUG=1` | 启用 Playwright Inspector |

---

## 问题排查

### 1. 锁文件冲突

**错误信息**:
```
An active lockfile is found at:
/Users/xxx/Library/Caches/ms-playwright/__dirlock
```

**解决方案**:
```bash
rm -rf ~/Library/Caches/ms-playwright/__dirlock
```

### 2. npm ci 失败

**解决方案**: 使用 `--ignore-scripts` 选项跳过安装脚本，稍后手动安装浏览器：
```bash
npm ci --ignore-scripts
npx playwright install
```

### 3. 构建后修改未生效

**检查步骤**:
1. 确保修改的是 `src/` 目录下的 `.ts` 文件，而不是 `lib/` 目录下的 `.js` 文件
2. 重新运行 `npm run build`
3. 确保测试脚本引用的是本地包路径

### 4. 浏览器启动失败

**解决方案**:
```bash
# 重新安装浏览器
npx playwright install --force
```

---

## Python Playwright 集成

如果你需要在 Python 中使用修改后的 JS Playwright，请按以下步骤操作。

### 原理说明

playwright-python 通过 **Driver 包机制** 来使用 JS Playwright：
- Python Playwright 的 driver 位于：`playwright/driver/package/`
- 其中 `lib/` 目录包含编译后的 JS 代码
- `cli.js` 是入口点，由内置的 Node.js 执行

### 同步 JS 修改到 Python

我们提供了一个同步脚本来自动完成这个过程：

```bash
# 在 playwright-python 项目中
cd /path/to/playwright-python

# 运行同步脚本 (假设 JS playwright 在同级目录)
./scripts/sync_local_js_driver.sh /path/to/playwright
```

脚本会自动：
1. 备份原有的 `lib` 目录
2. 复制 JS Playwright 构建的 `lib` 目录
3. 同步 `browsers.json` 确保浏览器版本匹配

### 手动同步步骤

如果你想手动操作：

```bash
# 1. 在 JS Playwright 项目中构建
cd /path/to/playwright
npm run build

# 2. 复制 lib 目录到 Python Playwright
cp -r packages/playwright-core/lib /path/to/playwright-python/playwright/driver/package/

# 3. 复制 browsers.json (确保浏览器版本匹配)
cp packages/playwright-core/browsers.json /path/to/playwright-python/playwright/driver/package/

# 4. 如果浏览器版本有更新，重新安装浏览器
cd /path/to/playwright-python
python3 -m playwright install chromium
```

### 安装 Python 依赖

```bash
cd /path/to/playwright-python

# 以开发模式安装
pip3 install -e .
```

### 验证 Python 中修改是否生效

运行测试脚本：

```bash
# 使用 DEBUG 环境变量查看详细日志
DEBUG=pw:api python3 tests/test_custom_dev_modification.py
```

预期输出中会看到我们添加的自定义日志：

```
2025-11-26T09:18:39.570Z pw:api [CUSTOM_DEV_TEST] goto() 被调用，目标URL: https://www.baidu.com
```

### Python 测试脚本示例

```python
#!/usr/bin/env python3
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # 调用 goto - 这会触发我们修改的代码
    page.goto("https://www.baidu.com")
    
    print(f"URL: {page.url}")
    print(f"标题: {page.title()}")
    
    browser.close()
```

---

## 构建 Python Wheel 包

如果你需要将修改后的 Playwright 打包成 `.whl` 文件，以便在其他项目中通过 `pip install` 安装，请按以下步骤操作。

### 使用打包脚本（推荐）

我们提供了一个自动化脚本，可以同时构建 **macOS** 和 **Linux** 两个平台的 wheel 包：

```bash
cd /path/to/playwright-python

# 构建所有平台（Mac + Linux）
./scripts/build_local_wheel.sh /path/to/playwright

# 或仅构建特定平台
./scripts/build_local_wheel.sh /path/to/playwright --platform mac-arm64
./scripts/build_local_wheel.sh /path/to/playwright --platform linux
```

### 支持的平台参数

| 参数 | 说明 | 输出文件 |
|------|------|----------|
| `all` | 同时构建 Mac 和 Linux（默认） | 两个 .whl 文件 |
| `mac-arm64` | macOS ARM64 (M1/M2/M3) | `*-macosx_11_0_arm64.whl` |
| `mac` | macOS x86_64 (Intel) | `*-macosx_10_13_x86_64.whl` |
| `linux` | Linux x86_64 | `*-manylinux1_x86_64.whl` |
| `linux-arm64` | Linux ARM64 | `*-manylinux_2_17_aarch64.whl` |

### 构建输出示例

```
生成的 Wheel 文件:

  dist/playwright-1.56.1.dev1+g3d1b875-py3-none-macosx_11_0_arm64.whl
  大小: 40M

  dist/playwright-1.56.1.dev1+g3d1b875-py3-none-manylinux1_x86_64.whl
  大小: 44M
```

### 手动构建步骤

如果你想手动构建：

```bash
cd /path/to/playwright-python

# 1. 同步 JS Playwright driver
./scripts/sync_local_js_driver.sh /path/to/playwright

# 2. 安装构建依赖
pip3 install build wheel setuptools setuptools-scm

# 3. 构建 wheel（会根据当前系统平台生成）
python3 -m build --wheel

# 4. 查看生成的文件
ls -la dist/*.whl
```

### 安装 Wheel 包

在其他项目中安装生成的 wheel：

```bash
# macOS ARM64 环境
pip3 install /path/to/playwright-python/dist/playwright-*-macosx_11_0_arm64.whl

# Linux x86_64 环境
pip3 install /path/to/playwright-python/dist/playwright-*-manylinux1_x86_64.whl

# 首次安装后需要安装浏览器
playwright install chromium
```

### 验证安装

```bash
# 验证自定义修改是否生效
DEBUG=pw:api python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://www.baidu.com')
    print(f'URL: {page.url}')
    browser.close()
"
```

如果看到 `[CUSTOM_DEV_TEST]` 日志，说明自定义修改已生效！

### 注意事项

1. **平台匹配**: 确保在目标环境安装对应平台的 wheel 包
2. **浏览器安装**: 首次安装 wheel 后需要运行 `playwright install` 安装浏览器
3. **版本号**: wheel 版本号由 `setuptools-scm` 从 git 标签自动生成
4. **Node.js**: wheel 包内置了 Node.js，无需额外安装

---

## 参考资料

- [Playwright 官方文档](https://playwright.dev/)
- [贡献指南](./CONTRIBUTING.md)
- [GitHub 仓库](https://github.com/microsoft/playwright)
- [Playwright Python GitHub](https://github.com/microsoft/playwright-python)

---

## 总结

通过以上步骤，我们成功搭建了 Playwright 的本地开发环境，并验证了源码修改可以正常生效。

### JS Playwright 开发环境

1. ✅ 检查 Node.js 版本 (v23.10.0)
2. ✅ 安装项目依赖 (`npm ci --ignore-scripts`)
3. ✅ 构建项目 (`npm run build`)
4. ✅ 安装浏览器 (`npx playwright install chromium`)
5. ✅ 修改源码 (`frames.ts` 中添加自定义日志)
6. ✅ 重新构建并验证修改生效

### Python Playwright 集成

1. ✅ 运行同步脚本 (`./scripts/sync_local_js_driver.sh`)
2. ✅ 安装 Python 依赖 (`pip3 install -e .`)
3. ✅ 运行 Python 测试验证修改生效

### 构建可分发的 Wheel 包

1. ✅ 运行打包脚本 (`./scripts/build_local_wheel.sh`)
2. ✅ 生成 macOS wheel (`*-macosx_11_0_arm64.whl`)
3. ✅ 生成 Linux wheel (`*-manylinux1_x86_64.whl`)
4. ✅ 可通过 `pip3 install` 在其他项目中安装

### 快速命令速查

```bash
# JS Playwright 开发
cd /path/to/playwright
npm ci --ignore-scripts && npm run build
DEBUG=pw:api node dev-test/test-custom-modification.js

# Python Playwright 集成
cd /path/to/playwright-python
./scripts/sync_local_js_driver.sh /path/to/playwright
pip3 install -e .
DEBUG=pw:api python3 tests/test_custom_dev_modification.py

# 构建 Wheel 包（Mac + Linux）
./scripts/build_local_wheel.sh /path/to/playwright
ls dist/*.whl
```

现在你可以自由地修改 Playwright 源码，并通过 JS 或 Python 测试脚本验证你的修改，还可以打包成 wheel 分发给其他项目使用！

