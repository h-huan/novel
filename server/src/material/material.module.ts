/**
 * 素材库模块
 *
 * 提供文本解析、风格向量化、语义检索能力
 */

import { Module } from '@nestjs/common';
import { MaterialService } from './material.service';
import { MaterialController } from './material.controller';

@Module({
  controllers: [MaterialController],
  providers: [MaterialService],
  exports: [MaterialService],
})
export class MaterialModule {}
