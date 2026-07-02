/**
 * 大纲 Module
 */
import { Module } from '@nestjs/common';
import { OutlineController } from './outline.controller';
import { OutlineService } from './outline.service';
import { OutlineRepository } from '../../database/repositories/outline.repository';

@Module({
  controllers: [OutlineController],
  providers: [OutlineService, OutlineRepository],
  exports: [OutlineService],
})
export class OutlineModule {}
