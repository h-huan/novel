import { RelationshipType } from '../enums/chapter';

export interface Character {
  id: string;
  projectId: string;
  name: string;
  identity: string;
  age: number;
  gender: string;
  role: 'protagonist' | 'major' | 'supporting' | 'minor';
  traits: {
    strength: number;
    intelligence: number;
    leadership: number;
    charisma: number;
    willpower: number;
  };
  background: string;
  appearance: string;
  personality: string;
  motivation: string;
  arc: string;
  dialogueStyle: string;
  tags: string[];
  relationships: Relationship[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Relationship {
  characterId: string;
  characterName: string;
  type: RelationshipType;
  description: string;
  intimacy: number;
  updatedAt: Date;
}
