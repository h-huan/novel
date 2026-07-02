/**
 * 角色状态管理 Store
 * 通过 REST API 管理真实角色数据
 */
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Character, Relationship } from '@novel/shared';

interface CreateCharacterDto {
  name: string;
  identity: string;
  projectId: string;
  role?: string;
}

interface UpdateCharacterDto {
  name?: string;
  identity?: string;
  appearance?: string;
  background?: string;
  personality?: string;
  motivation?: string;
  dialogueStyle?: string;
  tags?: string[];
  age?: number;
  gender?: string;
}

interface CharacterState {
  characters: Character[];
  currentCharacter: Character | null;
  relationships: Relationship[];
  loading: boolean;

  fetchCharacters: (projectId: string, forceRefresh?: boolean) => Promise<void>;
  createCharacter: (data: CreateCharacterDto) => Promise<void>;
  updateCharacter: (id: string, projectId: string, data: UpdateCharacterDto) => Promise<void>;
  deleteCharacter: (id: string, projectId: string) => Promise<void>;
  selectCharacter: (id: string) => void;
}

function apiPayload<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data ?? res ?? []) as T;
}

function parseJsonSafe(value: any, fallback: any) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapServerCharacter(raw: any): Character {
  const personality = parseJsonSafe(raw.personality, raw.personality || {});
  const abilities = parseJsonSafe(raw.abilities, raw.abilities || {});
  const relationships = parseJsonSafe(raw.relationships, []);
  const arc = parseJsonSafe(raw.arc, raw.arc || '');
  const tags = parseJsonSafe(raw.tags, raw.tags || []);
  const result: any = {
    id: raw.id,
    projectId: raw.projectId,
    name: raw.name,
    age: raw.age ?? 0,
    gender: raw.gender ?? '',
    role: raw.role ?? 'supporting',
    identity: raw.identity ?? '',
    appearance: raw.appearance ?? '',
    background: raw.background ?? '',
    personality,
    motivation: raw.motivation ?? abilities.desire ?? abilities.shortTermGoal ?? '',
    traits: raw.traits || {
      strength: abilities.combat ?? abilities.strength ?? personality.combat ?? 50,
      intelligence: abilities.intelligence ?? personality.intelligence ?? 50,
      leadership: abilities.leadership ?? personality.leadership ?? 50,
      charisma: abilities.charisma ?? personality.charisma ?? 50,
      willpower: abilities.willpower ?? personality.willpower ?? 50,
    },
    abilities,
    arc,
    dialogueStyle: raw.dialogueStyle ?? '',
    tags: Array.isArray(tags) ? tags : [],
    relationships: (Array.isArray(relationships) ? relationships : []).map((r: any) => ({
      characterId: r.characterId || r.targetId,
      characterName: r.characterName || r.targetName || '',
      type: r.type ?? 'neutral',
      description: r.description ?? '',
      intimacy: r.intimacy ?? 5,
      updatedAt: new Date(r.updatedAt || raw.updatedAt),
    })),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
  return result as Character;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  currentCharacter: null,
  relationships: [],
  loading: false,

  fetchCharacters: async (projectId: string, forceRefresh = false) => {
    // 缓存检查：同一项目且已有数据则跳过，除非强制刷新
    if (!forceRefresh && get().characters.length > 0) {
      const firstChar = get().characters[0];
      if (firstChar && firstChar.projectId === projectId) return;
    }
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/characters`);
      const list = apiPayload<any[]>(res);
      const characters = Array.isArray(list) ? list.map(mapServerCharacter) : [];
      set({ characters, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createCharacter: async (data: CreateCharacterDto) => {
    try {
      const res = await api.post<any>(`/projects/${data.projectId}/characters`, {
        name: data.name,
        identity: data.identity,
        role: data.role,
      });
      const ch = mapServerCharacter(apiPayload(res));
      set((state) => ({
        characters: [...state.characters, ch],
        currentCharacter: ch,
      }));
    } catch {}
  },

  updateCharacter: async (id: string, projectId: string, data: UpdateCharacterDto) => {
    try {
      const res = await api.put<any>(`/projects/${projectId}/characters/${id}`, data);
      const updated = mapServerCharacter(apiPayload(res));
      set((state) => ({
        characters: state.characters.map((c) => (c.id === id ? updated : c)),
        currentCharacter: state.currentCharacter?.id === id ? updated : state.currentCharacter,
      }));
    } catch {}
  },

  deleteCharacter: async (id: string, projectId: string) => {
    try {
      await api.delete(`/projects/${projectId}/characters/${id}`);
      set((state) => ({
        characters: state.characters.filter((c) => c.id !== id),
        currentCharacter: state.currentCharacter?.id === id ? null : state.currentCharacter,
      }));
    } catch {}
  },

  selectCharacter: (id: string) => {
    const character = get().characters.find((ch) => ch.id === id) || null;
    const allRelationships: Relationship[] = [];
    get().characters.forEach((ch) => {
      ch.relationships.forEach((rel) => {
        if (!allRelationships.find((r) => r.characterId === rel.characterId)) {
          allRelationships.push(rel);
        }
      });
    });
    set({ currentCharacter: character, relationships: allRelationships });
  },
}));
