/**
 * 冲突检测 Module
 *
 * 真实的「前后矛盾」数据来自 ConsistencyCheckService（基于已确认的角色/世界观/伏笔/大纲做确定性校验，
 * 结果持久化在 consistency_checks 表）。ConflictController 直接读取 consistency_checks，
 * 不再依赖任何内存桩或假数据。
 */
import { Module } from '@nestjs/common';
import { ConflictController } from './conflict.controller';
import { StateManagementModule } from '../../state/state-management.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [StateManagementModule, DatabaseModule],
  controllers: [ConflictController],
})
export class ConflictModule {}
