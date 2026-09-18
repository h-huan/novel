/**
 * HelpPage - 使用手册
 * 不设独立滚动容器，依赖 AppLayout 的 main overflow-y-auto
 */
import React from 'react';

const sections = [
  {
    title: '📖 灵感发现（创作起点）',
    content: `可从灵感发现开始新作品，三步完成从选题到项目创建。

第一步 - 配置创作参数
  • 故事类型：短篇（8,000-35,000字）/ 长篇（不少于100,000字，不设固定上限）
  • 目标字数：填写后严格执行；留空时由题材事件量动态规划
  • 目标平台：知乎盐选、番茄小说、起点中文网、抖音故事等
  • 故事分类：级联选择（大类→子类），如玄幻·奇幻→玄幻
  • 故事基调：热血/刀人/爽文/悬疑/搞笑等情绪标签，可多选

第二步 - AI发现题材
  • 当前灵感场景配置的模型一次生成5个不同题材；缺项时最多补齐一次，不切换模型
  • 每个题材含：标题、长短篇、平台、标签、钩子、概要、人物、篇幅与章节规划
  • 点击卡片展开查看详情
  • 不满意可点「重新发现」，AI自动排除已出现过的标题

第三步 - 创建项目
  • 选中题材后自动调用标题检测，提示重名/近似风险
  • 选定平台、长短篇、字数、分类、基调、风格和流派写入唯一创作宪法
  • 自动生成大纲结构（卷/章）、角色档案、世界观设定，并按阶段执行一致性 Gate
  • 完成后自动跳转到项目概览页

提示：分类、基调、写作风格和网文流派来自统一字典；创建后写入项目创作宪法。`,
  },
  {
    title: '📚 字典管理（平台通用数据）',
    content: `管理项目创建时可选的分类与标签，所有项目共享。

当前管理的字典类型：
  • 故事分类 — 支持大类与子类
  • 故事基调 — 读者应感受到的主要情绪
  • 写作风格 — 语言与叙事手法
  • 网文流派 — 系统、重生、无限流等设定类型

操作方式：
  • 顶部按钮切换要管理的字典类型
  • 输入框输入名称，点「添加」或回车
  • 点击标签右侧「编辑」可修改名称
  • 点击「删除」移除条目
  • 故事分类下可直接在列表中添加子分类
  • 只维护页面实际支持的字典类型`,
  },
  {
    title: '⚙️ 设置 - API Key 管理',
    content: `添加 AI 模型的 API Key 才能调用写作功能。

操作步骤：
  1. 选择模型提供商
  2. 输入 Key 名称
  3. 输入 API Key
  4. 如需自定义 API 地址，填入 Base URL
  5. 点「保存」，点「测试连接」验证

兼容接口：填写提供商、Base URL 和 API Key 后保存。

提示：添加 Key 后去「模型配置」页刷新模型列表。`,
  },
  {
    title: '⚙️ 设置 - 模型配置',
    content: `为每个写作场景指定具体使用的 AI 模型版本。

三个模式是三组彼此独立的用户配置，不会自动填入或替换模型：
  • 省钱、常规、高品质各自保存一列配置
  • 每列包含：日常、灵感、大纲/架构、正文、精修/质检
  • 场景已配置时严格使用该模型；未配置时只继承当前模式的日常模型
  • 场景与日常都未配置时停止任务，不切换模型、提供商或模式
  • 保存配置后还需点击「启用此模式」；编辑其他列不会改变当前模式

要点：先添加 API Key，再刷新模型列表。刷新成功后列表只显示提供商实时返回的 API 模型 ID；实时获取失败时才显示明确标记的内置兜底。`,
  },
  {
    title: '🤖 功能页面一览',
    content: `创作质量看板 (/) — 作品、问题、评分、趋势与修复数据
项目管理 (/projects) — 搜索、新建与管理作品
灵感发现 (/discover) — 创作起点，选题→创建
字典管理 (/dictionary) — 分类/风格/基调等通用数据
当前执行标准 (/module-standards) — 查看实际参与生成的最新标准
设置（启动窗口 /settings）— API Key、当前模式和五个模型场景

📝 写作 (/project/:id/writing) — Markdown编辑器 + AI辅助
📋 大纲 (/project/:id/outline) — 卷/章结构管理
👥 角色 (/project/:id/characters) — 角色卡片 + 关系网
🌍 世界观 (/project/:id/world) — 地理/势力/规则设定
🔍 伏笔 (/project/:id/foreshadowing) — 埋设与回收管理
🛠 精修 (/project/:id/refinement) — 润色/一致性检查
📤 导入导出 (/project/:id/import-export) — Word/TXT/EPUB`,
  },
  {
    title: '✍️ 写作风格（项目内使用）',
    content: `项目标签分为三个独立维度，不能混用：

故事基调 — 读者情绪，如热血、悬疑、治愈、压抑
写作风格 — 语言与叙事手法，如白描、群像、第一人称、倒叙
网文流派 — 核心设定类型，如系统流、重生、穿越、无限流

创建作品时选定的标签写入创作宪法。后续世界观、角色、大纲、正文和精修统一读取这一份配置；修改项目配置会产生新的创作宪法版本。`,
  },
];

const HelpPage: React.FC = () => {
  return (
    <div style={{ padding: '24px', maxWidth: '780px' }}>
      <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>📘 使用手册</h1>
      <p style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginBottom: '20px' }}>
        平台功能概览与操作指引 · 共 {sections.length} 个章节
      </p>

      {sections.map((s, i) => (
        <div key={i} style={{
          padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)',
          borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: '12px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '10px' }}>{s.title}</div>
          <div style={{ fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.8 }}>
            {s.content.split('\n').map((line, j) => (
              <div key={j} style={{
                marginBottom: line.trim() ? '4px' : '8px',
                color: line.trim().startsWith('提示') || line.trim().startsWith('要点')
                  ? 'var(--color-warning)' : line.trim().startsWith('•') ? 'var(--color-text-soft)' : 'var(--color-text-soft)',
              }}>
                {line.trim() || ''}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default HelpPage;
