import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { ReviewService } from './review.service';
import { Review } from './entity/review.entity';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';

class CreateReviewRequest {
  @IsString() session_token: string;
  @IsInt() order_item_id: number;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() body?: string;
}

function toResponse(r: Review) {
  return {
    id: r.id,
    orderItemId: r.orderItemId,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt,
  };
}

/** Product reviews (FR-040) — widget submit/list + tenant admin list. */
@ApiTags('Review')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('reviews')
  @Public()
  @ApiOperation({ summary: 'Submit a product review (requires auth)' })
  async create(@Body() body: CreateReviewRequest) {
    const review = await this.reviewService.create(
      body.session_token,
      body.order_item_id,
      body.rating,
      body.body,
    );
    return toResponse(review);
  }

  @Get('reviews')
  @Public()
  @ApiOperation({ summary: "List the customer's reviews (requires auth)" })
  async list(@Query('session_token') token: string) {
    const reviews = await this.reviewService.listForSession(token);
    return reviews.map(toResponse);
  }

  @Get('admin/reviews')
  @RequireCapability(CAPABILITY.MODULE_OPERATIONS)
  @ApiOperation({ summary: 'List reviews (tenant admin)' })
  async adminList(
    @CurrentUser() _user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.reviewService.listAll(p, s);
    return new Paginated(items.map(toResponse), buildPagination(p, s, total));
  }
}
