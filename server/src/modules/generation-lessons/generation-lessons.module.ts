/**
 * 知识点（写作经验 / 避坑经验）Module
 * 提供作者手动逐条增删改查 generation_lessons 表的端点。
 */
import { Module } from '@nestjs/common';
import { GenerationLessonsController } from './generation-lessons.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [GenerationLessonsController],
})
export class GenerationLessonsModule {}
