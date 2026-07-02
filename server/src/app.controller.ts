/**
 * 根控制器
 * 提供健康检查和基础API
 */

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('status')
  getStatus() {
    return this.appService.getStatus();
  }
}
