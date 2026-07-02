/**
 * 冲突检测 Module
 */
import { Module } from '@nestjs/common';
import { ConflictController } from './conflict.controller';
import { ConflictEngineService } from './conflict-engine.service';

@Module({
  controllers: [ConflictController],
  providers: [ConflictEngineService],
  exports: [ConflictEngineService],
})
export class ConflictEngineModule {}
