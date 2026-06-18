import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY } from '@ivy/types';
import { InquiryService } from './inquiry.service';
import { CreateInquiryRequest, InquiryListQuery } from './dto/inquiry.dto';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';

/** Widget inquiry endpoints (FR-044). */
@ApiTags('Inquiries')
@Controller('inquiries')
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Open a support inquiry (FR-044)' })
  async create(@Body() body: CreateInquiryRequest) {
    return this.inquiryService.create(body.session_token, body.conversation_id, body.order_id);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: "List the session customer's inquiries" })
  async list(@Query() query: InquiryListQuery) {
    return this.inquiryService.listForSession(query.session_token, query.page, query.size);
  }
}

/** Admin inquiry handling (consult module). */
@ApiTags('Inquiries')
@Controller('admin/inquiries')
export class AdminInquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Get()
  @RequireCapability(CAPABILITY.MODULE_CONSULT)
  @ApiOperation({ summary: 'List inquiries (admin)' })
  async list(@Query('page') page?: string, @Query('size') size?: string) {
    return this.inquiryService.listAll(page, size);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITY.MODULE_CONSULT)
  @ApiOperation({ summary: 'Mark an inquiry answered' })
  async answer(@Param('id', ParseIntPipe) id: number) {
    return this.inquiryService.markAnswered(id);
  }
}
