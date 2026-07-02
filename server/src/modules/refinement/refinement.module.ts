/**
 * 精修系统 Module
 */
import { Module } from '@nestjs/common';
import { RefinementController } from './refinement.controller';
import { RefinementTemplatesService } from './refinement-templates.service';
import { DeAiEngineService } from './de-ai-engine.service';
import { DescribePolishService } from './describe-polish.service';
import { QualityInspectionService } from './quality-inspection.service';
import { SpellCheckService } from './spell-check.service';
import { SensitiveWordService } from './sensitive-word.service';
import { CopyrightCheckService } from './copyright-check.service';
import { ExportService } from './export.service';
import { ScriptExportService } from './script-export.service';
import { SocialExportService } from './social-export.service';

@Module({
  controllers: [RefinementController],
  providers: [
    RefinementTemplatesService,
    DeAiEngineService,
    DescribePolishService,
    QualityInspectionService,
    SpellCheckService,
    SensitiveWordService,
    CopyrightCheckService,
    ExportService,
    ScriptExportService,
    SocialExportService,
  ],
  exports: [
    RefinementTemplatesService,
    DeAiEngineService,
    DescribePolishService,
    QualityInspectionService,
    SpellCheckService,
    SensitiveWordService,
    CopyrightCheckService,
    ExportService,
    ScriptExportService,
    SocialExportService,
  ],
})
export class RefinementModule {}
