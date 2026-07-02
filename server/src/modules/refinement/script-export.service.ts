/**
 * 短剧/分镜输出
 * 剧本格式转换 + 分镜表生成 + AI生图提示词
 */
import { Injectable } from '@nestjs/common';
import type { ScriptScene, ScriptLine, StoryboardFrame } from './dto/refinement.dto';

interface ScriptOptions {
  title?: string;
  sceneCount?: number;
  generateImagePrompts?: boolean;
}

@Injectable()
export class ScriptExportService {
  /**
   * 将叙事文本转换为剧本格式
   */
  convertToScript(content: string, options?: ScriptOptions): {
    scenes: ScriptScene[];
    rawScript: string;
  } {
    const paragraphs = content.split('\n').filter((p) => p.trim().length > 0);
    const scenes: ScriptScene[] = [];
    const targetSceneCount = options?.sceneCount || Math.min(paragraphs.length, 10);

    for (let i = 0; i < targetSceneCount; i++) {
      const paraIndex = Math.floor((i / targetSceneCount) * paragraphs.length);
      const paraText = paragraphs[paraIndex] || '';

      const scene = this.parseScene(paraText, i + 1, options);
      scenes.push(scene);
    }

    // 生成原始剧本文本
    const rawScript = this.formatScriptText(scenes);

    return { scenes, rawScript };
  }

  /**
   * 生成分镜表
   */
  generateStoryboard(scenes: ScriptScene[], options?: ScriptOptions): StoryboardFrame[] {
    const frames: StoryboardFrame[] = [];
    let frameNumber = 0;

    for (const scene of scenes) {
      for (const line of scene.lines) {
        frameNumber++;

        const shotTypes = ['远景', '全景', '中景', '近景', '特写'];
        const cameraAngles = ['平视', '俯视', '仰视', '侧拍', '跟拍'];

        const frame: StoryboardFrame = {
          frameNumber,
          shotType: this.pickShotType(line, shotTypes),
          cameraAngle: cameraAngles[Math.floor(Math.random() * cameraAngles.length)],
          visualDescription: this.buildVisualDescription(scene, line),
          dialogue: line.type === 'dialogue' ? line.content : '',
          duration: this.calculateDuration(line),
          imagePrompt: options?.generateImagePrompts !== false
            ? this.generateImagePrompt(scene, line)
            : '',
        };

        frames.push(frame);
      }

      // 场景间切换镜头
      if (scene.sceneNumber < scenes.length) {
        frameNumber++;
        frames.push({
          frameNumber,
          shotType: '切换',
          cameraAngle: '平视',
          visualDescription: `场景切换到：${scenes[scene.sceneNumber]?.sceneTitle || '下一场'}`,
          dialogue: '',
          duration: '1s',
          imagePrompt: '',
        });
      }
    }

    return frames;
  }

  /**
   * 生成分镜表文本
   */
  formatStoryboardTable(frames: StoryboardFrame[]): string {
    const header = '| 镜头 | 景别 | 角度 | 画面描述 | 对白 | 时长 | 生图提示词 |';
    const separator = '|------|------|------|----------|------|------|------------|';

    const rows = frames.map(
      (f) =>
        `| ${f.frameNumber} | ${f.shotType} | ${f.cameraAngle} | ${f.visualDescription} | ${f.dialogue || '-'} | ${f.duration} | ${f.imagePrompt || '-'} |`,
    );

    return [header, separator, ...rows].join('\n');
  }

  /**
   * 生成绘图提示词
   */
  generateImagePrompt(scene: ScriptScene, line?: ScriptLine): string {
    const parts: string[] = [];

    // 场景设置
    if (scene.setting) parts.push(`场景：${scene.setting}`);
    if (scene.timeOfDay) parts.push(`时间：${scene.timeOfDay}`);

    // 角色
    if (scene.characters.length > 0) {
      parts.push(`角色：${scene.characters.join('、')}`);
    }

    // 动作/对话描述
    if (line) {
      if (line.type === 'action') parts.push(`动作：${line.content}`);
      if (line.type === 'dialogue' && line.character) {
        parts.push(`${line.character}${line.emotion ? `(${line.emotion})` : ''}`);
      }
      if (line.emotion) parts.push(`情绪：${line.emotion}`);
    }

    // 风格
    parts.push('风格：写实电影感');
    parts.push('构图：黄金分割');
    parts.push('光照：自然光效');

    return parts.join(' | ');
  }

  private parseScene(content: string, sceneNumber: number, _options?: ScriptOptions): ScriptScene {
    const sentences = content.split(/[。！？]/).filter((s) => s.trim().length > 0);

    // 提取场景信息
    const settingMatch = content.match(/(在|来到|走进|进入)([^，。]{2,20})/);
    const timeMatch = content.match(/(早上|清晨|上午|中午|下午|傍晚|黄昏|晚上|深夜|午夜|黎明)/);
    const characterMatches = content.match(/([^，。\s]{2,4})(?:说|道|问|答|喊|叫|哭|笑|走|看|望)/g);

    const setting = settingMatch ? settingMatch[2] : '未知场景';
    const timeOfDay = timeMatch ? timeMatch[1] : '白天';
    const characters: string[] = [];

    if (characterMatches) {
      for (const m of characterMatches) {
        const name = m.slice(0, -1);
        if (!characters.includes(name) && name.length >= 2) {
          characters.push(name);
        }
      }
    }

    if (characters.length === 0) {
      characters.push('主角');
    }

    // 解析对白和动作
    const lines = this.parseLines(sentences, characters);

    return {
      sceneNumber,
      sceneTitle: `场景${sceneNumber}：${setting}`,
      setting,
      timeOfDay,
      characters,
      lines,
      imagePrompt: this.generateImagePrompt({
        sceneNumber,
        sceneTitle: `场景${sceneNumber}：${setting}`,
        setting,
        timeOfDay,
        characters,
        lines: [],
      }),
    };
  }

  private parseLines(sentences: string[], characters: string[]): ScriptLine[] {
    const lines: ScriptLine[] = [];

    for (const sentence of sentences) {
      // 检测对白
      const dialogueMatch = sentence.match(/[""「『]([^""」』]+)[""」』]/);
      if (dialogueMatch) {
        const speaker = characters.find((c) => sentence.includes(c)) || '角色';
        const beforeDialogue = sentence.slice(0, Math.max(0, sentence.indexOf(dialogueMatch[0])));
        const emotion = this.detectEmotion(beforeDialogue);

        // 添加动作 (如果对白前有动作描述)
        if (beforeDialogue.replace(speaker, '').trim().length > 0) {
          lines.push({
            type: 'action',
            content: beforeDialogue.trim(),
            duration: '2s',
          });
        }

        lines.push({
          type: 'dialogue',
          character: speaker,
          content: dialogueMatch[1],
          emotion,
          duration: this.estimateDialogueDuration(dialogueMatch[1]),
        });
      } else {
        // 动作/叙述
        lines.push({
          type: 'action',
          content: sentence.trim(),
          duration: '3s',
        });
      }
    }

    if (lines.length === 0) {
      lines.push({
        type: 'action',
        content: sentences.join('。') + '。',
        duration: '5s',
      });
    }

    return lines;
  }

  private detectEmotion(text: string): string {
    if (/(怒|愤|气|吼|骂)/.test(text)) return '愤怒';
    if (/(笑|喜|乐|高兴)/.test(text)) return '高兴';
    if (/(哭|泣|悲|伤|哀)/.test(text)) return '悲伤';
    if (/(惊|吓|恐|惧|怕)/.test(text)) return '恐惧';
    if (/(轻|低|小|悄声)/.test(text)) return '轻声';
    if (/(大|高|喊|叫|嚷)/.test(text)) return '大声';
    if (/(叹|无奈|摇头)/.test(text)) return '无奈';
    return '平静';
  }

  private estimateDialogueDuration(content: string): string {
    const charCount = content.length;
    if (charCount <= 5) return '1s';
    if (charCount <= 15) return '2s';
    if (charCount <= 30) return '3s';
    return '4s';
  }

  private calculateDuration(line: ScriptLine): string {
    if (line.duration) return line.duration;
    if (line.type === 'action') return '3s';
    if (line.type === 'dialogue') return this.estimateDialogueDuration(line.content);
    return '2s';
  }

  private pickShotType(line: ScriptLine, shotTypes: string[]): string {
    if (line.type === 'dialogue') {
      // 对白多用近景/特写
      return Math.random() > 0.5 ? '近景' : '特写';
    }
    if (line.content.includes('全身') || line.content.includes('远处')) {
      return '全景';
    }
    if (line.content.includes('眼神') || line.content.includes('表情')) {
      return '特写';
    }
    return shotTypes[Math.floor(Math.random() * shotTypes.length)];
  }

  private buildVisualDescription(scene: ScriptScene, line: ScriptLine): string {
    if (line.type === 'dialogue') {
      return `${line.character}(${line.emotion || '平静'}): "${line.content}"`;
    }
    return `${scene.setting} - ${line.content}`;
  }

  private formatScriptText(scenes: ScriptScene[]): string {
    const parts: string[] = [];

    for (const scene of scenes) {
      parts.push(`="=${scene.sceneTitle}="=`);
      parts.push(`场景：${scene.setting}`);
      parts.push(`时间：${scene.timeOfDay}`);
      parts.push(`角色：${scene.characters.join('、')}`);
      parts.push('');

      for (const line of scene.lines) {
        switch (line.type) {
          case 'action':
            parts.push(`△ ${line.content}`);
            break;
          case 'dialogue':
            parts.push(`${line.character}${line.emotion ? `(${line.emotion})` : ''}：${line.content}`);
            break;
          case 'note':
            parts.push(`※ ${line.content}`);
            break;
        }
      }

      parts.push('');
      parts.push('');
    }

    return parts.join('\n');
  }
}
