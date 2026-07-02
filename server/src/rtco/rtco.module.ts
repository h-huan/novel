/**
 * RTCO 分级模块
 *
 * 提供动态Token预算分配和上下文注入能力
 * P0核心/P1关键/P2备用/P3归档 四级分类
 */

import { Module } from '@nestjs/common';
import { RTCOService } from './rtco.service';
import { ContextInjectorService } from './context-injector.service';

@Module({
  providers: [RTCOService, ContextInjectorService],
  exports: [RTCOService, ContextInjectorService],
})
export class RTCOServiceModule {}
