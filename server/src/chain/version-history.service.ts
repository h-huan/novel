/**
 * VersionHistoryService - 版本历史管理服务
 * 基于内存存储的版本快照管理（生产环境应改为SQLite）
 *
 * 管理两种版本：
 * - 章节版本 (chapterId + projectId)
 * - Chain 模板版本 (chainId)
 */
import { Injectable, Logger } from '@nestjs/common';

export interface VersionSnapshot {
  id: string;
  chapterId: string;
  projectId: string;
  title: string;
  content: string;
  size: number;
  timestamp: string;
  isCurrent: boolean;
}

export interface ChainVersion {
  id: string;
  chainId: string;
  version: string;
  chainData: object;
  snapshot: object;
  timestamp: string;
  message: string;
}

@Injectable()
export class VersionHistoryService {
  private readonly logger = new Logger(VersionHistoryService.name);
  private snapshots: Map<string, VersionSnapshot[]> = new Map();

  createSnapshot(projectId: string, chapterId: string, content: string, title?: string): VersionSnapshot {
    const snapshot: VersionSnapshot = {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chapterId,
      projectId,
      title: title || `版本 ${new Date().toLocaleDateString('zh-CN')}`,
      content,
      size: content.length,
      timestamp: new Date().toISOString(),
      isCurrent: true,
    };

    const key = `${projectId}:${chapterId}`;
    const existing = this.snapshots.get(key) || [];

    // 把之前的当前版本标记为非当前
    existing.forEach(v => v.isCurrent = false);
    existing.push(snapshot);

    // 最多保留20个版本
    if (existing.length > 20) {
      existing.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const trimmed = existing.slice(0, 20);
      this.snapshots.set(key, trimmed);
    } else {
      this.snapshots.set(key, existing);
    }

    this.logger.log(`创建版本快照: ${snapshot.id} (${snapshot.size}字)`);
    return snapshot;
  }

  getHistory(projectId: string, chapterId: string): VersionSnapshot[] {
    const key = `${projectId}:${chapterId}`;
    const versions = this.snapshots.get(key) || [];
    return versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getVersion(versionId: string): VersionSnapshot | null {
    for (const [, versions] of this.snapshots) {
      const found = versions.find(v => v.id === versionId);
      if (found) return found;
    }
    return null;
  }

  restoreVersion(projectId: string, chapterId: string, versionId: string): { success: boolean; content?: string; error?: string } {
    const key = `${projectId}:${chapterId}`;
    const versions = this.snapshots.get(key);
    if (!versions) return { success: false, error: '未找到版本历史' };

    const target = versions.find(v => v.id === versionId);
    if (!target) return { success: false, error: `版本 ${versionId} 不存在` };

    // 标记目标版本为当前
    versions.forEach(v => v.isCurrent = v.id === versionId);
    this.logger.log(`恢复到版本: ${versionId}`);
    return { success: true, content: target.content };
  }

  diffVersions(versionA: string, versionB: string): {
    success: boolean; diff?: { additions: number; deletions: number; net: number; changes: { type: string; location: string; desc: string }[] }; error?: string
  } {
    const vA = this.getVersion(versionA);
    const vB = this.getVersion(versionB);
    if (!vA || !vB) return { success: false, error: '版本不存在' };

    const linesA = vA.content.split('\n');
    const linesB = vB.content.split('\n');

    const changes: { type: string; location: string; desc: string }[] = [];
    let additions = 0, deletions = 0;

    const maxLen = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= linesA.length) {
        additions += linesB[i].length;
        changes.push({ type: 'insert', location: `第${i + 1}行`, desc: `新增内容 ${linesB[i].substring(0, 30)}...` });
      } else if (i >= linesB.length) {
        deletions += linesA[i].length;
        changes.push({ type: 'delete', location: `第${i + 1}行`, desc: `删除内容 ${linesA[i].substring(0, 30)}...` });
      } else if (linesA[i] !== linesB[i]) {
        additions += linesB[i].length;
        deletions += linesA[i].length;
        changes.push({ type: 'modify', location: `第${i + 1}行`, desc: `"${linesA[i].substring(0, 20)}" → "${linesB[i].substring(0, 20)}"` });
      }
    }

    return {
      success: true,
      diff: { additions, deletions, net: additions - deletions, changes: changes.slice(0, 10) },
    };
  }

  // ==================== Chain 版本管理 ====================

  private chainVersions: Map<string, ChainVersion[]> = new Map();

  async saveChainVersion(chainId: string, chainData: object, message?: string): Promise<ChainVersion> {
    const existing = this.chainVersions.get(chainId) || [];
    const versionNum = existing.length + 1;
    const cv: ChainVersion = {
      id: `cv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chainId,
      version: `1.0.${versionNum}`,
      chainData,
      snapshot: JSON.parse(JSON.stringify(chainData)),
      timestamp: new Date().toISOString(),
      message: message || `版本 ${versionNum}`,
    };
    existing.push(cv);
    // 最多保留 30 个版本
    if (existing.length > 30) {
      existing.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      this.chainVersions.set(chainId, existing.slice(0, 30));
    } else {
      this.chainVersions.set(chainId, existing);
    }
    this.logger.log(`保存 Chain 版本: ${cv.id} (${chainId} v${cv.version})`);
    return cv;
  }

  async getChainVersions(chainId: string): Promise<ChainVersion[]> {
    return (this.chainVersions.get(chainId) || [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async restoreChainVersion(chainId: string, versionId: string): Promise<ChainVersion> {
    const versions = this.chainVersions.get(chainId);
    if (!versions) throw new Error(`Chain ${chainId} 无版本历史`);
    const target = versions.find(v => v.id === versionId);
    if (!target) throw new Error(`版本 ${versionId} 不存在`);
    this.logger.log(`恢复到 Chain 版本: ${versionId} (${chainId})`);
    return target;
  }

  async diffChainVersions(versionId1: string, versionId2: string): Promise<{
    added: any[];
    removed: any[];
    modified: any[];
  }> {
    const v1 = this.findChainVersion(versionId1);
    const v2 = this.findChainVersion(versionId2);
    if (!v1 || !v2) throw new Error('版本不存在');

    const data1 = JSON.parse(JSON.stringify(v1.chainData));
    const data2 = JSON.parse(JSON.stringify(v2.chainData));

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];

    // 比较节点列表
    const nodes1 = (data1.nodes || []) as any[];
    const nodes2 = (data2.nodes || []) as any[];
    const ids1 = new Set(nodes1.map((n: any) => n.id));
    const ids2 = new Set(nodes2.map((n: any) => n.id));

    for (const node of nodes1) {
      if (!ids2.has(node.id)) removed.push(node);
    }
    for (const node of nodes2) {
      if (!ids1.has(node.id)) added.push(node);
      else {
        const old = nodes1.find((n: any) => n.id === node.id);
        if (old && JSON.stringify(old) !== JSON.stringify(node)) modified.push({ id: node.id, old, new: node });
      }
    }

    return { added, removed, modified };
  }

  private findChainVersion(versionId: string): ChainVersion | undefined {
    for (const [, versions] of this.chainVersions) {
      const found = versions.find(v => v.id === versionId);
      if (found) return found;
    }
    return undefined;
  }
}
