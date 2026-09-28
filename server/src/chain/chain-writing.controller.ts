import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChainController } from './chain.controller';

/** Focused HTTP adapter for chapter writing, context, quality checks and local repair. */
@ApiTags('chain')
@Controller('chain')
export class ChainWritingController {
  constructor(private readonly chain: ChainController) {}

  @Post('generate')
  generate(@Body() dto: Parameters<ChainController['generate']>[0]) {
    return this.chain.generate(dto);
  }

  @Post('stream-generate')
  streamGenerate(
    @Body() dto: Parameters<ChainController['streamGenerate']>[0],
    @Res() res: Parameters<ChainController['streamGenerate']>[1],
  ) {
    return this.chain.streamGenerate(dto, res);
  }

  @Post('continue')
  continueWriting(@Body() dto: Parameters<ChainController['continueWriting']>[0]) {
    return this.chain.continueWriting(dto);
  }

  @Post('enhance-opening')
  enhanceOpening(@Body() dto: Parameters<ChainController['enhanceOpening']>[0]) {
    return this.chain.enhanceOpening(dto);
  }

  @Post('enhance-reversal')
  enhanceReversal(@Body() dto: Parameters<ChainController['enhanceReversal']>[0]) {
    return this.chain.enhanceReversal(dto);
  }

  @Post('adapt-platform')
  adaptPlatform(@Body() dto: Parameters<ChainController['adaptPlatform']>[0]) {
    return this.chain.adaptPlatform(dto);
  }

  @Post('chapter-transition')
  chapterTransition(@Body() dto: Parameters<ChainController['chapterTransition']>[0]) {
    return this.chain.chapterTransition(dto);
  }

  @Post('previous-summary')
  previousSummary(@Body() dto: Parameters<ChainController['previousSummary']>[0]) {
    return this.chain.previousSummary(dto);
  }

  @Post('per-paragraph-polish')
  perParagraphPolish(@Body() dto: Parameters<ChainController['perParagraphPolish']>[0]) {
    return this.chain.perParagraphPolish(dto);
  }

  @Post('conflict-mark')
  conflictMark(@Body() dto: Parameters<ChainController['conflictMark']>[0]) {
    return this.chain.conflictMark(dto);
  }

  @Post('post-conflict-qa')
  postConflictQA(@Body() dto: Parameters<ChainController['postConflictQA']>[0]) {
    return this.chain.postConflictQA(dto);
  }

  @Post('writing-context')
  writingContext(@Body() dto: Parameters<ChainController['writingContext']>[0]) {
    return this.chain.writingContext(dto);
  }

  @Post('writing-context/raw')
  rawWritingContext(@Body() dto: Parameters<ChainController['rawWritingContext']>[0]) {
    return this.chain.rawWritingContext(dto);
  }

  @Post('post-write-archive')
  postWriteArchive(@Body() dto: Parameters<ChainController['postWriteArchive']>[0]) {
    return this.chain.postWriteArchive(dto);
  }

  @Post('dialogue-style')
  dialogueStyle(@Body() dto: Parameters<ChainController['dialogueStyle']>[0]) {
    return this.chain.dialogueStyle(dto);
  }

  @Post('foreshadow-recommend')
  foreshadowRecommend(@Body() dto: Parameters<ChainController['foreshadowRecommend']>[0]) {
    return this.chain.foreshadowRecommend(dto);
  }
}
