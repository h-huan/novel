/**
 * script-export.service.spec.ts
 * ScriptExportService 单元测试 — 短剧/分镜输出
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptExportService } from './script-export.service';

describe('ScriptExportService', () => {
  let service: ScriptExportService;

  const sampleContent = `陆川推开客栈的房门，夜色中隐约能看到远处的城楼灯火。
"小二，这奉天城最近有什么事吗？"
店小二压低声音："客官有所不知，城东的将军府昨晚来了个神秘人物……"
陆川眉头一皱，心中隐隐感到不安。`;

  beforeEach(() => {
    service = new ScriptExportService();
  });

  describe('convertToScript', () => {
    it('should convert narrative text to script scenes', () => {
      const result = service.convertToScript(sampleContent);
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.rawScript).toBeDefined();
    });

    it('each scene should have sceneNumber, setting, characters, and lines', () => {
      const result = service.convertToScript(sampleContent);
      for (const scene of result.scenes) {
        expect(scene).toHaveProperty('sceneNumber');
        expect(scene).toHaveProperty('setting');
        expect(scene).toHaveProperty('lines');
        expect(Array.isArray(scene.lines)).toBe(true);
      }
    });

    it('should extract dialogue lines', () => {
      const result = service.convertToScript(sampleContent);
      const allLines = result.scenes.flatMap(s => s.lines);
      const dialogues = allLines.filter(l => l.type === 'dialogue');
      expect(dialogues.length).toBeGreaterThan(0);
      expect(dialogues.some(d => d.character)).toBe(true);
    });

    it('should respect sceneCount option', () => {
      const result = service.convertToScript(sampleContent, { sceneCount: 3 });
      expect(result.scenes.length).toBeLessThanOrEqual(3);
    });

    it('should include image prompts when requested', () => {
      const result = service.convertToScript(sampleContent, { generateImagePrompts: true });
      const scenesWithPrompts = result.scenes.filter(s => s.imagePrompt);
      expect(scenesWithPrompts.length).toBeGreaterThan(0);
    });
  });

  describe('generateImagePrompt', () => {
    it('should generate a prompt from a scene', () => {
      const scene = {
        sceneNumber: 1,
        sceneTitle: '客栈夜谈',
        setting: '客栈房间',
        timeOfDay: '夜晚',
        characters: ['陆川', '店小二'],
        lines: [{ type: 'action' as const, content: '陆川推开房门' }],
      };
      const prompt = service.generateImagePrompt(scene);
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('客栈');
    });
  });

  describe('generateStoryboard', () => {
    it('should generate storyboard frames from scenes', () => {
      const scriptResult = service.convertToScript(sampleContent);
      const frames = service.generateStoryboard(scriptResult.scenes);
      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBeGreaterThan(0);
    });

    it('each frame should have shotType, cameraAngle, and visualDescription', () => {
      const scriptResult = service.convertToScript(sampleContent);
      const frames = service.generateStoryboard(scriptResult.scenes);
      for (const frame of frames) {
        expect(frame).toHaveProperty('shotType');
        expect(frame).toHaveProperty('cameraAngle');
        expect(frame).toHaveProperty('visualDescription');
        expect(frame).toHaveProperty('duration');
      }
    });

    it('should have sequential frame numbers', () => {
      const scriptResult = service.convertToScript(sampleContent);
      const frames = service.generateStoryboard(scriptResult.scenes);
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i].frameNumber).toBe(i + 1);
      }
    });
  });

  describe('formatStoryboardTable', () => {
    it('should produce a markdown table', () => {
      const scriptResult = service.convertToScript(sampleContent);
      const frames = service.generateStoryboard(scriptResult.scenes);
      const table = service.formatStoryboardTable(frames);
      expect(table).toContain('|'); // markdown table separator
      expect(table).toContain('镜头');
      expect(table).toContain('景别');
      expect(table).toContain('画面描述');
    });

    it('should include frames in the table', () => {
      const scriptResult = service.convertToScript(sampleContent);
      const frames = service.generateStoryboard(scriptResult.scenes);
      const table = service.formatStoryboardTable(frames);
      expect(table).toContain('镜头');
      expect(table).toContain('景别');
      expect(table).toContain('画面描述');
      expect(table.split('\n').length).toBeGreaterThan(3); // header + separator + data
    });
  });
});
