/**
 * 冲突检测 Module
 *
 * 「前后矛盾」读取统一 QualityIssue，由 ConsistencyCheckService 写入确定性检查结果。
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
