# 长短篇自适应 UI 设计方案（子墨交付）

> 来源：ui-designer（子墨）
> 用途：指导前端实现长短篇自适应界面

## 一、设计原则

1. **简洁明了** — 去掉冗余，一眼看懂
2. **可视化操作** — 能看图操作的不要填表单
3. **长短篇区分** — 短篇极简，长篇完整

---

## 二、模式切换逻辑

根据 `ProjectType` 在路由层动态渲染不同组件：

```tsx
const WorldPage = () => {
  const { project } = useProjectStore();
  return project.type === 'short_story' 
    ? <WorldSimpleView /> 
    : <WorldTabView />;
};
```

切换时机：项目创建时选择，项目设置中可修改（需提示数据隐藏风险）。

---

## 三、短篇模式设计（极简）

### 3.1 世界观页面（WorldSimpleView）

**单卡片 + 可视化标签，避免表单**

组件结构：
- `StoryPremiseInput` — 故事前提输入框（大字号，占位符："一个...的故事"）
- `EraSelector` — 时代背景可视化下拉（古代🏯、现代🏙️、未来🚀）
- `LocationTags` — 核心地点标签输入（最多3个，带📍图标）
- `SocialRulesText` — 社会规则文本域（200字限制，提供快捷模板）
- `SpecialSettingFold` — 特殊设定折叠区（可选）

### 3.2 人物页面（CharacterSimpleView）

**卡片墙 + 拖拽排序，最多5个**

`CharacterSimpleCard` 显示：头像、姓名、身份、核心目标（一句话）、性格标签（3-5个）、故事功能（主角/反派/助攻）

交互：点击卡片右侧滑出简化编辑面板，不跳转新页面。

### 3.3 大纲页面（OutlineSimpleView）

**线性列表 + 天龙8步法可视化**

- `Tianlong8Steps` — 8个核心要素卡片横向排列，完成状态绿色高亮
- `ChapterLinearList` — 时间线样式章节列表（左侧竖线+圆圈节点）
- `PacingCurveChart` — 节奏曲线图（横轴章节，纵轴冲突强度）

---

## 四、长篇模式设计（完整）

### 4.1 世界观页面（WorldTabView）

复用现有 WorldPage 的6个Tab，优化交互：
- 地理/势力 Tab：保留三视图，图谱升级为力导向图
- 其他 Tab：增加批量操作、搜索栏、拖拽排序
- 修改世界观：优化影响评估可视化（颜色编码：红=高/黄=中/绿=低）

### 4.2 人物页面（CharacterDetailView）

左侧分组树 → 中间卡片墙 → 右侧详情面板（6大区域：基础信息、性格心理、背景经历、故事功能、关系网络、出场统计）

底部分析Tab：关系网络图、弧光跟踪、出场统计图表

### 4.3 大纲页面（OutlineVolumeView）

左侧卷结构树 → 中间章节列表（按卷展开） → 右侧章节详情

底部分析Tab：伏笔管理（时间线可视化）、反转计划表、情感曲线图（支持叠加多角色）

---

## 五、组件复用策略

| 模块 | 短篇组件 | 长篇组件 | 共用组件 |
|------|----------|----------|----------|
| 世界观 | `WorldSimpleView` | `WorldTabView` | `EraSelector`、`LocationTag` |
| 人物 | `CharacterSimpleView` | `CharacterDetailView` | `Avatar`、`TraitTag` |
| 大纲 | `OutlineSimpleView` | `OutlineVolumeView` | `ChapterEditor` |

同一路由，根据 `project.type` 动态渲染不同组件。

---

## 六、文件结构

```
desktop/src/renderer/
├── pages/
│   ├── WorldPage.tsx          // 路由入口，动态渲染
│   ├── CharacterPage.tsx
│   └── OutlinePage.tsx
├── components/
│   ├── world/
│   │   ├── WorldSimpleView.tsx
│   │   ├── WorldTabView.tsx
│   │   └── common/
│   ├── character/
│   │   ├── CharacterSimpleView.tsx
│   │   ├── CharacterDetailView.tsx
│   │   └── common/
│   └── outline/
│       ├── OutlineSimpleView.tsx
│       ├── OutlineVolumeView.tsx
│       └── common/
```

---

## 七、实现优先级

1. **先实现短篇模式**（极简，快速验证）
2. **再实现长篇模式**（完整功能，复用现有代码）
3. **最后优化交互**（可视化操作、动画效果）

---

## 八、注意事项

1. 所有组件必须接入真实 API，不准使用 mock 数据
2. 短篇模式组件要尽量简洁，减少认知负担
3. 长篇模式组件要功能完整，但交互要直观
4. 模式切换要平滑，不能让用户感到突兀
