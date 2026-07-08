/**
 * WritingQuality Controller - Phase 6.1 API endpoints
 */
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WritingQualityService } from './writing-quality.service';
import {
  AnalyzeChapterDto,
  AttentionCheckDto,
  ListReportsDto,
  RefineIssueDto,
  UpdateIssueStatusDto,
} from './dto/writing-quality.dto';

@ApiTags('writing-quality')
@Controller('projects/:projectId/writing-quality')
export class WritingQualityController {
  constructor(private readonly service: WritingQualityService) {}

  /** POST /projects/:projectId/writing-quality/analyze */
  @Post('analyze')
  analyzeChapter(@Param('projectId') projectId: string, @Body() dto: AnalyzeChapterDto) {
    return this.service.analyzeChapterQuality(projectId, dto);
  }

  /** POST /projects/:projectId/writing-quality/attention */
  @Post('attention')
  checkAttention(@Param('projectId') projectId: string, @Body() dto: AttentionCheckDto) {
    return this.service.checkAttention(projectId, dto);
  }

  /** GET /projects/:projectId/writing-quality/reports */
  @Get('reports')
  listReports(@Param('projectId') projectId: string, @Query() query: ListReportsDto) {
    return this.service.listReports(projectId, query);
  }

  /** GET /projects/:projectId/writing-quality/reports/:reportId */
  @Get('reports/:reportId')
  getReport(@Param('reportId') reportId: string) {
    return this.service.getReport(reportId);
  }

  /** POST /projects/:projectId/writing-quality/issues/:issueId/resolve */
  @Post('issues/:issueId/resolve')
  resolveIssue(@Param('issueId') issueId: string) {
    return this.service.markIssueResolved(issueId);
  }

  /** POST /projects/:projectId/writing-quality/issues/:issueId/status */
  @Post('issues/:issueId/status')
  updateIssueStatus(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: UpdateIssueStatusDto,
  ) {
    return this.service.updateIssueStatus(projectId, issueId, dto.status, dto.reason);
  }

  /** POST /projects/:projectId/writing-quality/issues/:issueId/refine */
  @Post('issues/:issueId/refine')
  refineIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: RefineIssueDto,
  ) {
    return this.service.refineIssue(projectId, issueId, dto);
  }

  /** POST /projects/:projectId/writing-quality/revisions/:revisionId/apply */
  @Post('revisions/:revisionId/apply')
  applyRevision(
    @Param('projectId') projectId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.service.applyRevision(projectId, revisionId);
  }

  /** POST /projects/:projectId/writing-quality/revisions/:revisionId/recheck */
  @Post('revisions/:revisionId/recheck')
  recheckRevision(
    @Param('projectId') projectId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.service.recheckAfterRevision(projectId, revisionId);
  }

  /** POST /projects/:projectId/writing-quality/issues/:issueId/recheck */
  @Post('issues/:issueId/recheck')
  recheckIssue(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.service.recheckIssue(projectId, issueId);
  }
}
