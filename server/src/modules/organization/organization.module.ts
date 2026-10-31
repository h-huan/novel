/**
 * 组织/势力 Module
 */
import { Module } from '@nestjs/common';
import { ENTITY_WRITER_TOKENS } from '../../state/entity-writer-tokens';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from '../../database/repositories/organization.repository';
import { RagModule } from '../../rag/rag.module';
import { StateModule } from '../../state/state.module';

@Module({
  imports: [RagModule, StateModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository, {provide:ENTITY_WRITER_TOKENS.organization,useExisting:OrganizationService}],
  exports: [OrganizationService],
})
export class OrganizationModule {}
