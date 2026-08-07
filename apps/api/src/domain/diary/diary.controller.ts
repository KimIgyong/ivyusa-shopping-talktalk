import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiaryService } from './diary.service';
import { toDiaryNoteResponse } from './diary.mapper';
import { Public } from '../../global/decorator/public.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';
import { CreateDiaryNoteRequest, RemoveDiaryNoteRequest } from './dto/request/diary.request';

/**
 * Shopping-diary memo endpoints (PLN-260807 F3, A-7). Public + session token;
 * the service rejects sessions not bound to a customer (401).
 */
@ApiTags('Diary')
@Controller('me/diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "The customer's diary memos, newest first (cap 100)" })
  async list(@SessionToken() token: string, @Query('size') size?: string) {
    const parsed = size !== undefined ? Number(size) : undefined;
    const rows = await this.diaryService.list(token, parsed);
    return rows.map(toDiaryNoteResponse);
  }

  @Post()
  @Public()
  @ApiOperation({ summary: 'Write a diary memo (optionally pinned to a catalog product)' })
  async create(@Body() body: CreateDiaryNoteRequest) {
    const note = await this.diaryService.create(body.session_token, body.body, body.product_handle);
    return toDiaryNoteResponse(note);
  }

  // POST (not DELETE) so the widget/app can send the session token in the body,
  // mirroring the other storefront mutation endpoints.
  @Post('remove')
  @Public()
  @ApiOperation({ summary: 'Remove a diary memo (idempotent, owner-scoped)' })
  async remove(@Body() body: RemoveDiaryNoteRequest) {
    const removed = await this.diaryService.remove(body.session_token, body.id);
    return { removed };
  }
}
