import { describe, expect, it } from 'vitest';
import {
  PLANNING_TOKEN_WEIGHTS,
  RAG_CHUNK_TOKEN_WEIGHTS,
  countTextWeights,
  estimateTokens,
} from './token-budget';

describe('token-budget: 规划口径（PLANNING）', () => {
  it('回归：3212 个中文 = 1928 token，而不是旧拉丁启发式的 4497', () => {
    // 旧口径 ceil(3212 / 4) = 803 字 -> 被当成 803 token，规划器据此把批次放大 2.4 倍。
    // 这里必须给出 1928，任何回到 4 字符/token 的行为都会让本用例变红。
    const text = '中'.repeat(3212);
    expect(estimateTokens(text, PLANNING_TOKEN_WEIGHTS)).toBe(1928);
    expect(estimateTokens(text, PLANNING_TOKEN_WEIGHTS)).not.toBe(4497);
  });

  it('整数权重不产生浮点漂移：1000 个中文 = 600（而非 601）', () => {
    // 浮点累加 0.6 一千次会得到 600.0000000000001，Math.ceil 后错成 601。
    expect(estimateTokens('中'.repeat(1000), PLANNING_TOKEN_WEIGHTS)).toBe(600);
  });

  it('小样本向上取整：1 个中文 = 1，5 个中文 = 3', () => {
    expect(estimateTokens('中', PLANNING_TOKEN_WEIGHTS)).toBe(1);
    expect(estimateTokens('中'.repeat(5), PLANNING_TOKEN_WEIGHTS)).toBe(3);
  });

  it('区分字符类别：空白 0.3、非 CJK 其它 0.35', () => {
    expect(estimateTokens(' '.repeat(1000), PLANNING_TOKEN_WEIGHTS)).toBe(300);
    expect(estimateTokens('a'.repeat(1000), PLANNING_TOKEN_WEIGHTS)).toBe(350);
  });

  it('空串与未定义输入归零，不做隐式默认', () => {
    expect(estimateTokens('', PLANNING_TOKEN_WEIGHTS)).toBe(0);
    expect(countTextWeights('', PLANNING_TOKEN_WEIGHTS)).toBe(0);
  });

  it('默认权重就是规划口径', () => {
    expect(estimateTokens('中'.repeat(1000))).toBe(600);
  });
});

describe('token-budget: RAG 分块口径（与历史实现逐字节等价）', () => {
  const legacyEstimate = (text: string): number => {
    let weighted = 0;
    for (const char of text) {
      if (/\s/.test(char)) continue;
      if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(char)) weighted += 2;
      else weighted += 1;
    }
    return Math.ceil(weighted * 0.7);
  };

  const alphabet = ['中', 'a', ' ', '，'];

  it('对字母表 {中,a,空格,，} 的全部长度<=6 组合穷举一致', () => {
    const words: string[] = [''];
    const all: string[] = [''];
    for (let len = 1; len <= 6; len += 1) {
      const next: string[] = [];
      for (const prefix of words) {
        for (const ch of alphabet) next.push(prefix + ch);
      }
      words.length = 0;
      words.push(...next);
      all.push(...next);
    }
    let checked = 0;
    for (const sample of all) {
      expect(estimateTokens(sample, RAG_CHUNK_TOKEN_WEIGHTS), 'input=' + JSON.stringify(sample)).toBe(
        legacyEstimate(sample),
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('长文本与随机文本同样保持一致', () => {
    let seed = 20260922;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i += 1) {
      const len = Math.floor(rand() * 120);
      let sample = '';
      for (let j = 0; j < len; j += 1) sample += alphabet[Math.floor(rand() * alphabet.length)];
      expect(estimateTokens(sample, RAG_CHUNK_TOKEN_WEIGHTS), 'input=' + JSON.stringify(sample)).toBe(
        legacyEstimate(sample),
      );
    }
  });
});