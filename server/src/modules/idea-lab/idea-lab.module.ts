/**
 * IdeaLabModule - 想法孵化模块
 *
 * 依赖:
 * - ChainModule (提供 RealLLMService)
 * - ProjectModule (提供 ProjectService)
 */
import { Module } from '@nestjs/common';
import { IdeaLabController } from './idea-lab.controller';
import { IdeaLabService } from './idea-lab.service';
import { IdeaDraftRepository } from '../../database/repositories/idea-draft.repository';
import { ChainModule } from '../../chain/chain.module';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [
    ChainModule,
    ProjectModule,
  ],
  controllers: [IdeaLabController],
  providers: [IdeaLabService, IdeaDraftRepository],
  exports: [IdeaLabService],
})
export class IdeaLabModule {}
