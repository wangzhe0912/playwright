# Viewport Position Feature for ARIA Snapshots

## 概述

本功能为 Playwright 的 `aria_snapshot` 方法在 AI 模式下添加了视口位置信息，帮助 AI 模型更好地理解元素在浏览器窗口中的位置关系。

## 实现细节

### 1. 类型定义 (domUtils.ts)

添加了新的类型 `ViewportPosition` 来表示元素相对于视口的位置：

```typescript
export type ViewportPosition = 'visible' | 'offscreen:above' | 'offscreen:below' | 'offscreen:left' | 'offscreen:right';
```

在 `Box` 类型中添加了可选字段：

```typescript
export type Box = {
  visible: boolean;
  inline: boolean;
  rect?: DOMRect;
  cursor?: CSSStyleDeclaration['cursor'];
  viewportPosition?: ViewportPosition;  // 新增
};
```

### 2. 视口位置计算逻辑 (domUtils.ts)

实现了 `computeViewportPosition` 函数来计算元素的视口位置：

```typescript
function computeViewportPosition(element: Element, rect: DOMRect): ViewportPosition {
  const doc = element.ownerDocument;
  if (!doc || !doc.defaultView)
    return 'visible';

  const viewport = {
    width: doc.defaultView.innerWidth,
    height: doc.defaultView.innerHeight
  };

  // 检查元素是否完全在视口内
  if (rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewport.height && rect.right <= viewport.width)
    return 'visible';

  // 根据元素中心点判断主要的离屏方向
  const centerY = (rect.top + rect.bottom) / 2;
  const centerX = (rect.left + rect.right) / 2;

  // 优先考虑垂直方向
  if (centerY < 0)
    return 'offscreen:above';
  if (centerY > viewport.height)
    return 'offscreen:below';
  if (centerX < 0)
    return 'offscreen:left';
  if (centerX > viewport.width)
    return 'offscreen:right';

  // 元素部分可见，视为可见
  return 'visible';
}
```

### 3. ARIA 快照渲染更新 (ariaSnapshot.ts)

#### 3.1 添加内部选项标志

在 `InternalOptions` 类型中添加了 `renderViewportPosition` 标志：

```typescript
type InternalOptions = {
  visibility: 'aria' | 'ariaOrVisible' | 'ariaAndVisible',
  refs: 'all' | 'interactable' | 'none',
  refPrefix?: string,
  includeGenericRole?: boolean,
  renderCursorPointer?: boolean,
  renderActive?: boolean,
  renderStringsAsRegex?: boolean,
  renderViewportPosition?: boolean,  // 新增
};
```

#### 3.2 在 AI 模式下启用视口位置渲染

更新了 `toInternalOptions` 函数，在 AI 模式下设置 `renderViewportPosition: true`：

```typescript
function toInternalOptions(options: AriaTreeOptions): InternalOptions {
  if (options.mode === 'ai') {
    return {
      visibility: 'ariaOrVisible',
      refs: 'interactable',
      refPrefix: options.refPrefix,
      includeGenericRole: true,
      renderActive: true,
      renderCursorPointer: true,
      renderViewportPosition: true,  // 新增
    };
  }
  // ...
}
```

#### 3.3 在渲染中输出视口位置标记

更新了 `createKey` 函数，在元素有 ref 时添加视口位置标记：

```typescript
if (ariaNode.ref) {
  key += ` [ref=${ariaNode.ref}]`;
  // 为 AI 模式添加视口位置标记
  if (options.renderViewportPosition && ariaNode.box.viewportPosition) {
    key += ` [${ariaNode.box.viewportPosition}]`;
  }
  if (renderCursorPointer && hasPointerCursor(ariaNode))
    key += ' [cursor=pointer]';
}
```

## 输出示例

### 之前的输出

```yaml
- link [ref=e109] [cursor=pointer]:
  - img [ref=e111] [cursor=pointer]
- generic [ref=e115]:
  - link [ref=e117] [cursor=pointer]:
    - img [ref=e118] [cursor=pointer]
```

### 现在的输出

```yaml
- link [ref=e109] [visible] [cursor=pointer]:
  - img [ref=e111] [visible] [cursor=pointer]
- generic [ref=e115] [offscreen:above]:
  - link [ref=e117] [offscreen:above] [cursor=pointer]:
    - img [ref=e118] [offscreen:above] [cursor=pointer]
```

## 测试

在 `tests/page/page-aria-snapshot-ai.spec.ts` 中添加了以下测试用例：

1. **should include viewport position markers**: 测试基本的视口位置标记功能
2. **should mark elements above viewport as offscreen:above**: 测试滚动后的视口位置标记

## 设计决策

1. **只在 AI 模式下启用**: 视口位置信息只在 `mode: 'ai'` 时输出，不影响其他模式（expect、codegen、autoexpect）的行为。

2. **只为有 ref 的元素添加标记**: 只有可交互的元素（有 ref 属性）才会显示视口位置，因为这些元素对 AI 操作更重要。

3. **优先考虑垂直方向**: 当判断离屏方向时，优先考虑垂直方向（above/below），因为网页通常是垂直滚动的。

4. **部分可见视为可见**: 如果元素的中心点在视口内，即使元素部分超出视口，也标记为 `[visible]`。

## 边缘情况处理

1. **display: contents 元素**: 这些元素本身不渲染，不会计算视口位置。
2. **不可见元素**: visibility: hidden 或其他不可见的元素不会计算视口位置。
3. **没有 document 或 window 的元素**: 返回 'visible' 作为默认值。

## 性能考虑

- `getBoundingClientRect()` 调用已经在 `computeBox` 中存在，新增的计算只是简单的数值比较，性能影响可忽略不计。
- 视口位置信息只在需要时计算（即有 rect 的可见元素）。

## 兼容性

- 该功能完全向后兼容，不影响现有的 API 和行为。
- 只在 AI 模式下添加新的输出标记，其他模式保持不变。
