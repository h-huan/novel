/**
 * 编辑器状态管理 Store
 * 管理当前编辑内容、脏状态、字数统计
 */

import { create } from 'zustand';

interface EditorState {
  /** 当前编辑内容 */
  currentContent: string;
  /** 是否有未保存的更改 */
  isDirty: boolean;
  /** 字数统计（中文按字符数，英文按单词数） */
  wordCount: number;

  /** 设置编辑内容并标记为脏状态 */
  setContent: (content: string) => void;
  /** 标记为已保存 */
  markSaved: () => void;
  /** 更新字数统计 */
  updateWordCount: () => void;
}

function countWords(text: string): number {
  if (!text.trim()) return 0;

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;

  // 统计英文单词（去除中文后的连续字母序列）
  const withoutChinese = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
  const englishWords = withoutChinese
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[a-zA-Z]/.test(w)).length;

  return chineseChars + englishWords;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentContent: '',
  isDirty: false,
  wordCount: 0,

  setContent: (content: string) => {
    set({
      currentContent: content,
      isDirty: true,
      wordCount: countWords(content),
    });
  },

  markSaved: () => {
    set({ isDirty: false });
  },

  updateWordCount: () => {
    set({ wordCount: countWords(get().currentContent) });
  },
}));
