import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { PlatformAnalyticsController } from './platform-analytics.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService],
  exports: [PlatformAnalyticsService],
})
export class PlatformAnalyticsModule {}
