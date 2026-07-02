/**
 * 灵感/题材共享类型
 */

export interface InspirationType {
  id: string;
  projectId: string | null;
  title: string;
  platform: string;
  hook: string;
  description: string;
  tags: string[];
  characters: string[];
  setting: string;
  estimatedWords: number;
  status: 'active' | 'converted' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CreateInspirationDto {
  title: string;
  platform: string;
  hook?: string;
  description?: string;
  tags?: string[];
  characters?: string[];
  setting?: string;
  estimatedWords?: number;
}

export interface ConvertToProjectDto {
  inspirationId: string;
  type?: 'short_story' | 'long_novel' | 'script';
}
