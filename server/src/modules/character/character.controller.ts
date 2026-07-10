/**
 * 角色 Controller
 * 注入 VectorIndexService，自动索引角色数据供 RAG 使用
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CharacterService } from './character.service';
import { CreateCharacterDto, AddRelationshipDto } from './dto/character.dto';
import { VectorIndexService } from '../../rag/vector-index.service';

@ApiTags('character')
@Controller('projects/:projectId/characters')
export class CharacterController {
  constructor(
    private readonly service: CharacterService,
    private readonly vectorIndex: VectorIndexService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateCharacterDto) {
    const result = await this.service.create(projectId, dto);
    await this.indexCharacter(projectId, result);
    return result;
  }

  @Put(':id')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: Partial<CreateCharacterDto>) {
    const result = await this.service.update(id, dto);
    await this.indexCharacter(projectId, result);
    return result;
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('search') search?: string) {
    if (search) return this.service.search(projectId, search);
    return this.service.findByProjectId(projectId);
  }

  @Get(':id/profile')
  getProfile(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.getProfile(projectId, id);
  }

  @Put(':id/profile')
  async updateProfile(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = this.service.updateProfile(projectId, id, body);
    await this.indexCharacter(projectId, result.character);
    return result;
  }

  @Get(':id/writing-summary')
  getWritingSummary(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.getWritingSummary(projectId, id);
  }

  @Post('consistency-check')
  checkConsistency(@Param('projectId') projectId: string, @Body() body: { content?: string }) {
    return { characterConsistency: this.service.checkConsistency(projectId, body.content || '') };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/relationships')
  addRelationship(@Param('id') id: string, @Body() dto: AddRelationshipDto) {
    return this.service.addRelationship(id, dto);
  }

  @Delete(':id/relationships/:targetId')
  removeRelationship(@Param('id') id: string, @Param('targetId') targetId: string) {
    return this.service.removeRelationship(id, targetId);
  }

  @Get(':id/state')
  getLatestState(@Param('id') id: string) {
    return this.service.getLatestState(id);
  }

  @Get(':id/state-history')
  getStateHistory(@Param('id') id: string) {
    return this.service.getStateHistory(id);
  }

  /** 将角色数据索引到 RAG 向量库 */
  private async indexCharacter(projectId: string, char: any): Promise<void> {
    try {
      const tagsText = Array.isArray(char.tags) ? char.tags.join('、') : (char.tags || '');
      const metadata: Record<string, unknown> = {
        projectId,
        name: char.name || '',
        identity: char.identity || '',
        personality: char.personality || '',
        dialogueStyle: char.dialogueStyle || '',
        role: char.role || 'supporting',
        tags: tagsText,
        docType: 'character',
      };
      await this.vectorIndex.indexChunks(VectorIndexService.COLLECTIONS.CHARACTERS, [{
        chunk: {
          id: char.id,
          text: `${char.name} ${char.identity} ${char.personality || ''} ${tagsText}`,
          docType: 'character_profile',
          metadata: { chunkIndex: 0, characters: [char.name || ''] },
        },
        vector: [0],
      }]);
    } catch { /* 索引失败不影响主流程 */ }
  }
}
