export interface GeographySetting {
  id: string;
  name: string;
  type: 'continent' | 'country' | 'region' | 'city' | 'landmark';
  description: string;
  climate?: string;
  resources?: string[];
  controlledBy?: string;
}

export interface FactionSetting {
  id: string;
  name: string;
  type: 'govt' | 'military' | 'cult' | 'business' | 'secret_society';
  description: string;
  leaderId?: string;
  members: string[];
  territory: string[];
}

export interface PowerSystem {
  id: string;
  name: string;
  type: 'magic' | 'martial' | 'supernatural' | 'technology';
  description: string;
  rules: string[];
  ranks: string[];
}

export interface Constraint {
  id: string;
  name: string;
  description: string;
  severity: 'hard' | 'soft';
  category: string;
}

export interface WorldSetting {
  id: string;
  projectId: string;
  geography: GeographySetting[];
  factions: FactionSetting[];
  powerSystems: PowerSystem[];
  constraints: Constraint[];
  society: { aspect: string; description: string }[];
  createdAt: Date;
  updatedAt: Date;
}
