/** Read-only API for the System Workflow Rule Registry. */
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModuleStandardsService } from './module-standards.service';

@ApiTags('module-standards')
@Controller('module-standards')
export class ModuleStandardsController {
  constructor(private readonly service: ModuleStandardsService) {}

  /** Compatibility grouped view. */
  @Get()
  list() { return { standards: this.service.list() }; }

  @Get('rules')
  rules() { return { rules: this.service.listRules() }; }

  @Get('rules/:id')
  rule(@Param('id') id: string) {
    const value = this.service.getRule(id);
    return value ? { rule: value } : { error: 'not found', rule: null };
  }

  @Get('rules/:id/impact')
  impact(@Param('id') id: string) {
    const value = this.service.impact(id);
    return value ? { impact: value } : { error: 'not found', impact: null };
  }

  @Get('status')
  status() { return this.service.status(); }

  @Get(':key')
  one(@Param('key') key: string) {
    const standard = this.service.get(key);
    return standard ? { standard } : { error: 'not found', standard: null };
  }
}
