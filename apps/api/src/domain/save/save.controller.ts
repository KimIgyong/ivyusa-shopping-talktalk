import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SaveService } from './save.service';
import { toSaveResponse } from './save.mapper';
import { SAVE_LIST, SaveList } from './entity/product-save.entity';
import { Public } from '../../global/decorator/public.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';
import { CreateSaveRequest, RemoveSaveRequest } from './dto/request/save.request';

/**
 * Wishlist / save-for-later endpoints (PLN-260807 F2, A-4). Public + session
 * token; the service rejects sessions not bound to a customer (401).
 */
@ApiTags('Save')
@Controller('saves')
export class SaveController {
  constructor(private readonly saveService: SaveService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "List the customer's saved products (optional ?list=wish|later)" })
  async list(@SessionToken() token: string, @Query('list') list?: string) {
    const filter =
      list === SAVE_LIST.WISH || list === SAVE_LIST.LATER ? (list as SaveList) : undefined;
    const rows = await this.saveService.list(token, filter);
    return rows.map(({ save, product }) => toSaveResponse(save, product));
  }

  @Post()
  @Public()
  @ApiOperation({ summary: 'Save a product to a list (upsert — re-save updates the note)' })
  async create(@Body() body: CreateSaveRequest) {
    const { save, product } = await this.saveService.upsert(
      body.session_token,
      body.product_handle,
      body.list,
      body.note,
    );
    return toSaveResponse(save, product);
  }

  // POST (not DELETE) so the widget/app can send the session token in the body,
  // mirroring the other storefront mutation endpoints.
  @Post('remove')
  @Public()
  @ApiOperation({ summary: 'Remove a saved product (idempotent)' })
  async remove(@Body() body: RemoveSaveRequest) {
    const removed = await this.saveService.remove(
      body.session_token,
      body.product_handle,
      body.list,
    );
    return { removed };
  }
}
