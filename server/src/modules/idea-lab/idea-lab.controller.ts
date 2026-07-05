/**
 * IdeaLabController - 想法孵化 API
 *
 * 路由前缀: /api/v1/idea-lab
 */
import { Controller, Get, Post, Put, Param, Body } from '@nestjs/common';
import { IdeaLabService } from './idea-lab.service';
import { CreateIdeaDraftDto } from './dto/create-idea-draft.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { ConfirmIdeaDto } from './dto/confirm-idea.dto';
import { ConvertToProjectDto } from './dto/convert-to-project.dto';

@Controller('idea-lab')
export class IdeaLabController {
  constructor(private readonly service: IdeaLabService) {}

  /**
   * 创建想法草稿
   * POST /api/v1/idea-lab/drafts
   */
  @Post('drafts')
  createDraft(@Body() dto: CreateIdeaDraftDto) {
    return this.service.createDraft(dto);
  }

  /**
   * 获取所有草稿
   * GET /api/v1/idea-lab/drafts
   */
  @Get('drafts')
  getAllDrafts() {
    return this.service.getAllDrafts();
  }

  /**
   * 获取草稿详情
   * GET /api/v1/idea-lab/drafts/:id
   */
  @Get('drafts/:id')
  getDraft(@Param('id') id: string) {
    return this.service.getDraft(id);
  }

  /**
   * 生成追问问题
   * POST /api/v1/idea-lab/drafts/:id/questions
   */
  @Post('drafts/:id/questions')
  async generateQuestions(@Param('id') id: string) {
    return await this.service.generateQuestionsAsync(id);
  }

  /**
   * 保存回答
   * PUT /api/v1/idea-lab/drafts/:id/answers
   */
  @Put('drafts/:id/answers')
  saveAnswers(@Param('id') id: string, @Body() dto: SaveAnswersDto) {
    return this.service.saveAnswers(id, dto);
  }

  /**
   * 完善想法
   * POST /api/v1/idea-lab/drafts/:id/refine
   */
  @Post('drafts/:id/refine')
  async refineIdea(@Param('id') id: string) {
    return await this.service.refineIdeaAsync(id);
  }

  /**
   * 确认想法
   * POST /api/v1/idea-lab/drafts/:id/confirm
   */
  @Post('drafts/:id/confirm')
  confirmIdea(@Param('id') id: string, @Body() dto: ConfirmIdeaDto) {
    return this.service.confirmIdea(id, dto);
  }

  /**
   * 转换为项目
   * POST /api/v1/idea-lab/drafts/:id/convert-to-project
   */
  @Post('drafts/:id/convert-to-project')
  convertToProject(@Param('id') id: string, @Body() dto: ConvertToProjectDto) {
    return this.service.convertToProject(id, dto);
  }
}
