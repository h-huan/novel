/**
 * HelpPage - 使用手册
 * 不设独立滚动容器，依赖 AppLayout 的 main overflow-y-auto
 */
import React from 'react';

const sections = [
  {
    title: '📖 灵感发现（创作起点）',
    content: `所有项目从灵感发现开始。三步完成从选题到项目创建。

第一步 - 配置创作参数
  • 故事类型：短篇（5000-20000字）/ 长篇（20万-80万字）
  • 目标字数：告诉AI每篇的大致篇幅
  • 目标平台：知乎盐选、番茄小说、起点中文网、抖音故事等
  • 故事分类：级联选择（大类→子类），如玄幻·奇幻→玄幻
  • 故事基调：热血/刀人/爽文/悬疑/搞笑等情绪标签，可多选

第二步 - AI发现题材
  • AI从不同角度生成5个不重复的题材
  • 每个题材含：标题、钩子、概要、人物、世界观
  • 点击卡片展开查看详情
  • 不满意可点「重新发现」，AI自动排除已出现过的标题

第三步 - 创建项目
  • 选中题材后自动调用标题检测，提示重名/近似风险
  • 自动生成大纲结构（卷/章）、角色档案、世界观设定
  • 完成后自动跳转到项目概览页

提示：故事分类和基调在「字典管理」统一维护，修改后此处自动生效。`,
  },
  {
    title: '📚 字典管理（平台通用数据）',
    content: `管理所有平台级通用数据，支持增删改查，所有项目共享。

当前管理的字典类型：
  • 📚 故事分类 — 级联结构（9个大类+39个子类）
    大类：玄幻·奇幻、武侠·仙侠、都市·现实、历史·军事、悬疑·灵异、科幻·末世、游戏·竞技、言情·情感、轻小说·二次元
  • 🎭 故事基调 — 热血/刀人/爽文/悬疑/搞笑/历史/女强/科幻/谍战/治愈
  • ✍️ 写作风格 — 群像叙事/系统流/第一人称/第三人称/倒叙/多线叙事/日记体/对话体

操作方式：
  • 顶部按钮切换要管理的字典类型
  • 输入框输入名称，点「添加」或回车
  • 点击标签右侧「编辑」可修改名称
  • 点击「删除」移除条目
  • 故事分类下可直接在列表中添加子分类
  • 支持自定义新建任意字典类型（输入类型名点「+新建」）`,
  },
  {
    title: '⚙️ 设置 - API Key 管理',
    content: `添加 AI 模型的 API Key 才能调用写作功能。

内置支持：DeepSeek、OpenAI、Claude、Gemini、Moonshot

操作步骤：
  1. 选择模型提供商
  2. 输入 Key 名称
  3. 输入 API Key
  4. 如需自定义 API 地址，填入 Base URL
  5. 点「保存」，点「测试连接」验证

自定义AI平台（Ollama、SiliconFlow等）：
  1. 填写平台名称、Base URL、API Key
  2. 点「添加平台」

提示：添加 Key 后去「模型配置」页刷新模型列表。`,
  },
  {
    title: '⚙️ 设置 - 模型配置',
    content: `为每个写作场景指定具体使用的 AI 模型版本。

三种快速填充模式：
  • 省钱模式 — 全部用 DeepSeek-V4-Flash（最便宜）
  • 常规模式 — 日常 DeepSeek，高潮/精修用 Claude
  • 高品质模式 — 全部用最强模型

自定义模式（推荐）：
  • 每个场景可单独下拉选择具体模型版本
  • 灵感生成、大纲规划、正文、精修可分别配置
  • 保存后自动切换到自定义模式

要点：先添加 API Key，再刷新模型列表拉取真实可用版本。`,
  },
  {
    title: '🤖 功能页面一览',
    content: `项目列表 (/) — 所有已创建项目，按更新时间排列
灵感发现 (/discover) — 创作起点，选题→创建
Prompt Chain (/prompt-chains) — AI写作链节点配置
字典管理 (/dictionary) — 分类/风格/基调等通用数据
设置 (/settings) — API Key + 模型配置

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
    content: `创建项目后可选择的叙事方式（来自字典管理）：

群像叙事 — 多视角切换，适合宏大世界观
系统流 — 数据面板+规则系统，游戏化叙事
第一人称 — "我"的视角叙述，代入感强
第三人称 — 上帝视角，全方位展示
倒叙 — 从结果回溯过程，层层揭密
多线叙事 — 多条故事线并行，交汇于高潮
日记体 — 以日记/笔记形式推进
对话体 — 以对话驱动剧情

在写作页可随时切换主风格或融合两种风格。`,
  },
];

const HelpPage: React.FC = () => {
  return (
    <div style={{ padding: '24px', maxWidth: '780px' }}>
      <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: '#eaeaea' }}>📘 使用手册</h1>
      <p style={{ fontSize: '12px', color: '#8a8aa0', marginBottom: '20px' }}>
        平台功能概览与操作指引 · 共 {sections.length} 个章节
      </p>

      {sections.map((s, i) => (
        <div key={i} style={{
          padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)',
          borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: '12px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#eaeaea', marginBottom: '10px' }}>{s.title}</div>
          <div style={{ fontSize: '12px', color: '#c0c0d0', lineHeight: 1.8 }}>
            {s.content.split('\n').map((line, j) => (
              <div key={j} style={{
                marginBottom: line.trim() ? '4px' : '8px',
                color: line.trim().startsWith('提示') || line.trim().startsWith('要点')
                  ? '#f59e0b' : line.trim().startsWith('•') ? '#d0d0e0' : '#c0c0d0',
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
