import { ProjectStatus, ProjectType } from '../enums/project';

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  description: string;
  wordCount: number;
  chapterCount: number;
  coverImage?: string;
  platforms?: string[];
  createdAt: Date;
  updatedAt: Date;
}
