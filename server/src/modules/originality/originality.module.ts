import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OriginalityGuardService } from './originality-guard.service';

@Module({
  imports: [DatabaseModule],
  providers: [OriginalityGuardService],
  exports: [OriginalityGuardService],
})
export class OriginalityModule {}
