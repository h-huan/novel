/**
 * Author's Note Module
 */
import { Module } from '@nestjs/common';
import { AuthorNoteController } from './author-note.controller';
import { AuthorNoteService } from './author-note.service';

@Module({
  controllers: [AuthorNoteController],
  providers: [AuthorNoteService],
  exports: [AuthorNoteService],
})
export class AuthorNoteModule {}
