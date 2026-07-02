/**
 * StoryDictModule - 创作字典模块
 */
import { Module } from '@nestjs/common';
import { StoryDictController } from './story-dict.controller';
import { StoryDictService } from './story-dict.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StoryDictController],
  providers: [StoryDictService],
  exports: [StoryDictService],
})
export class StoryDictModule {}
