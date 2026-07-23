import { Controller, Get, Param, Post } from '@nestjs/common';
import { CanonicalSyncStateService } from './canonical-sync-state.service';

@Controller('projects/:projectId/sync-status')
export class CanonicalSyncStateController {
  constructor(private readonly syncStates: CanonicalSyncStateService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    const items = [...this.syncStates.list(projectId), ...this.syncStates.listChapterDerived(projectId)];
    return {
      projectId,
      pending: items.filter((item) => item.needsResync).length,
      items,
    };
  }

  @Post(':entityType/:entityId/retry')
  retry(
    @Param('projectId') projectId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.syncStates.retry(projectId, entityType, entityId);
  }
}
