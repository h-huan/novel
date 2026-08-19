/**
 * 角色 Module
 */
import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import { RagModule } from '../../rag/rag.module';
import { StateModule } from '../../state/state.module';
import { MapPointModule } from '../map-point/map-point.module';

@Module({
  imports: [RagModule, StateModule, MapPointModule],
  controllers: [CharacterController],
  providers: [CharacterService, CharacterRepository, CharacterStateRepository],
  exports: [CharacterService],
})
export class CharacterModule {}
