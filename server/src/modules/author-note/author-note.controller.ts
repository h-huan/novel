/**
 * Author's Note Controller
 * API: CRUD + 冲突检测
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthorNoteService } from './author-note.service';
import { CreateAuthorNoteDto, UpdateAuthorNoteDto, CheckConflictDto, AuthorNoteScope, AuthorNoteRuleType } from './dto/author-note.dto';

@ApiTags('author-note')
@Controller('author-notes')
export class AuthorNoteController {
  constructor(private readonly service: AuthorNoteService) {}

  @Post()
  create(@Body() dto: CreateAuthorNoteDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('scope') scope?: AuthorNoteScope,
    @Query('ruleType') ruleType?: AuthorNoteRuleType,
    @Query('isActive') isActive?: string,
    @Query('chapterIndex') chapterIndex?: string,
    @Query('volumeIndex') volumeIndex?: string,
  ) {
    return this.service.findAll({
      scope,
      ruleType,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      chapterIndex: chapterIndex ? parseInt(chapterIndex, 10) : undefined,
      volumeIndex: volumeIndex ? parseInt(volumeIndex, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAuthorNoteDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /**
   * 冲突检测
   */
  @Post(':id/conflicts')
  detectConflicts(
    @Param('id') id: string,
    @Body() dto: CheckConflictDto,
  ) {
    return this.service.detectConflicts(id, dto.lockedChapterIds || []);
  }

  /**
   * 获取指定章节的注入Prompt
   */
  @Get('prompt/inject')
  getInjectedPrompt(
    @Query('chapterIndex') chapterIndex?: string,
    @Query('volumeIndex') volumeIndex?: string,
  ) {
    return this.service.getInjectedPrompt({
      chapterIndex: chapterIndex ? parseInt(chapterIndex, 10) : undefined,
      volumeIndex: volumeIndex ? parseInt(volumeIndex, 10) : undefined,
    });
  }
}
