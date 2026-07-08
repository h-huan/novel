import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContinuityService } from './continuity.service';

@ApiTags('continuity')
@Controller('projects/:projectId/continuity')
export class ContinuityController {
  constructor(private readonly service: ContinuityService) {}

  @Get('characters')
  getCharacters(@Param('projectId') projectId: string, @Query('focusChapterId') focusChapterId?: string) {
    return this.service.getCharacters(projectId, focusChapterId);
  }

  @Get('relationships')
  getRelationships(@Param('projectId') projectId: string, @Query('focusChapterId') focusChapterId?: string) {
    return this.service.getRelationships(projectId, focusChapterId);
  }

  @Get('foreshadowings')
  getForeshadowings(@Param('projectId') projectId: string, @Query('focusChapterId') focusChapterId?: string) {
    return this.service.getForeshadowings(projectId, focusChapterId);
  }

  @Post('character-states')
  createCharacterState(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createCharacterState(projectId, body);
  }

  @Patch('character-states/:stateId')
  updateCharacterState(@Param('projectId') projectId: string, @Param('stateId') stateId: string, @Body() body: any) {
    return this.service.updateCharacterState(projectId, stateId, body);
  }

  @Post('relationships')
  createRelationship(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createRelationship(projectId, body);
  }

  @Patch('relationships/:relationshipId')
  updateRelationship(@Param('projectId') projectId: string, @Param('relationshipId') relationshipId: string, @Body() body: any) {
    return this.service.updateRelationship(projectId, relationshipId, body);
  }

  @Post('relationships/:relationshipId/events')
  createRelationshipEvent(@Param('projectId') projectId: string, @Param('relationshipId') relationshipId: string, @Body() body: any) {
    return this.service.createRelationshipEvent(projectId, relationshipId, body);
  }

  @Post('foreshadowings')
  createForeshadowing(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createForeshadowingThread(projectId, body);
  }

  @Patch('foreshadowings/:threadId')
  updateForeshadowing(@Param('projectId') projectId: string, @Param('threadId') threadId: string, @Body() body: any) {
    return this.service.updateForeshadowingThread(projectId, threadId, body);
  }

  @Post('foreshadowings/:threadId/events')
  createForeshadowingEvent(@Param('projectId') projectId: string, @Param('threadId') threadId: string, @Body() body: any) {
    return this.service.createForeshadowingEvent(projectId, threadId, body);
  }

  @Post('foreshadowing-tasks')
  createForeshadowingTask(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createForeshadowingTask(projectId, body);
  }

  @Patch('foreshadowing-tasks/:taskId')
  updateForeshadowingTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any) {
    return this.service.updateForeshadowingTask(projectId, taskId, body);
  }

  // ===== Phase 7.4: World Rules =====

  @Get('world-rules')
  getWorldRules(@Param('projectId') projectId: string, @Query('focusChapterId') focusChapterId?: string) {
    return this.service.getWorldRules(projectId, focusChapterId);
  }

  @Post('world-rules')
  createWorldRule(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createWorldRule(projectId, body);
  }

  @Patch('world-rules/:ruleId')
  updateWorldRule(@Param('projectId') projectId: string, @Param('ruleId') ruleId: string, @Body() body: any) {
    return this.service.updateWorldRule(projectId, ruleId, body);
  }

  @Post('world-rules/:ruleId/events')
  createWorldRuleEvent(@Param('projectId') projectId: string, @Param('ruleId') ruleId: string, @Body() body: any) {
    return this.service.createWorldRuleEvent(projectId, ruleId, body);
  }

  @Post('world-rule-tasks')
  createWorldRuleTask(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createWorldRuleTask(projectId, body);
  }

  @Patch('world-rule-tasks/:taskId')
  updateWorldRuleTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any) {
    return this.service.updateWorldRuleTask(projectId, taskId, body);
  }

  // ===== Phase 7.4: Timeline =====

  @Get('timeline')
  getTimeline(@Param('projectId') projectId: string, @Query('focusChapterId') focusChapterId?: string) {
    return this.service.getTimeline(projectId, focusChapterId);
  }

  @Post('timeline-events')
  createTimelineEvent(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createTimelineEvent(projectId, body);
  }

  @Patch('timeline-events/:eventId')
  updateTimelineEvent(@Param('projectId') projectId: string, @Param('eventId') eventId: string, @Body() body: any) {
    return this.service.updateTimelineEvent(projectId, eventId, body);
  }

  @Post('timeline-links')
  createTimelineLink(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createTimelineLink(projectId, body);
  }

  @Patch('timeline-links/:linkId')
  updateTimelineLink(@Param('projectId') projectId: string, @Param('linkId') linkId: string, @Body() body: any) {
    return this.service.updateTimelineLink(projectId, linkId, body);
  }

  @Post('timeline-tasks')
  createTimelineTask(@Param('projectId') projectId: string, @Body() body: any) {
    return this.service.createTimelineTask(projectId, body);
  }

  @Patch('timeline-tasks/:taskId')
  updateTimelineTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any) {
    return this.service.updateTimelineTask(projectId, taskId, body);
  }
}
