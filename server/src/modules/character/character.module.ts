/**
 * 角色 Module
 */
import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import { RagModule } from '../../rag/rag.module';

@Module({
  imports: [RagModule],
  controllers: [CharacterController],
  providers: [CharacterService, CharacterRepository, CharacterStateRepository],
  exports: [CharacterService],
})
export class CharacterModule {}
