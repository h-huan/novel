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
}
