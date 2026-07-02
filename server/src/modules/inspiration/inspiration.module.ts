/**
 * InspirationModule - 灵感管理
 */
import { Module } from '@nestjs/common';
import { InspirationController } from './inspiration.controller';
import { InspirationService } from './inspiration.service';
import { InspirationRepository } from '../../database/repositories/inspiration.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { OutlineModule } from '../outline/outline.module';
import { CharacterModule } from '../character/character.module';
import { WorldSettingModule } from '../world-setting/world-setting.module';
import { ForeshadowingModule } from '../foreshadowing/foreshadowing.module';
import { OrganizationModule } from '../organization/organization.module';
import { MapPointModule } from '../map-point/map-point.module';
import { TimelineModule } from '../timeline/timeline.module';
import { ChainModule } from '../../chain/chain.module';

@Module({
  imports: [
    OutlineModule,
    CharacterModule,
    WorldSettingModule,
    ForeshadowingModule,
    OrganizationModule,
    MapPointModule,
    TimelineModule,
    ChainModule,
  ],
  controllers: [InspirationController],
  providers: [InspirationService, InspirationRepository, ProjectRepository],
  exports: [InspirationService],
})
export class InspirationModule {}
