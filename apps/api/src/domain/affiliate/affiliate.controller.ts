import { Body, Controller, Get, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { CAPABILITY, Principal } from '@ivy/types';
import { buildPagination, normalizePage } from '@ivy/common';
import { AffiliateService } from './affiliate.service';
import { Affiliate } from './entity/affiliate.entity';
import { Public } from '../../global/decorator/public.decorator';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

class ApplyRequest {
  @IsString() session_token: string;
}
class ReviewRequest {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
}

function toResponse(a: Affiliate) {
  return {
    id: a.id,
    status: a.status,
    linkCode: a.linkCode,
    commissionRate: a.commissionRate,
    appliedAt: a.appliedAt,
    reviewedAt: a.reviewedAt,
  };
}

/** Affiliate program (FR-041) — widget apply/status + tenant admin review. */
@ApiTags('Affiliate')
@Controller()
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Post('affiliate/apply')
  @Public()
  @ApiOperation({ summary: 'Apply to the affiliate program (requires auth)' })
  async apply(@Body() body: ApplyRequest) {
    const affiliate = await this.affiliateService.apply(body.session_token);
    return toResponse(affiliate);
  }

  @Get('affiliate/status')
  @Public()
  @ApiOperation({ summary: 'Get the current affiliate application status (requires auth)' })
  async status(@Query('session_token') token: string) {
    const affiliate = await this.affiliateService.status(token);
    if (!affiliate) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return {
      status: affiliate.status,
      linkCode: affiliate.linkCode,
      commissionRate: affiliate.commissionRate,
    };
  }

  @Get('admin/affiliates')
  @RequireCapability(CAPABILITY.MODULE_ACCOUNTING)
  @ApiOperation({ summary: 'List affiliate applications (tenant admin)' })
  async adminList(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const { page: p, size: s } = normalizePage(page, size);
    const [items, total] = await this.affiliateService.listAll(this.tenantId(user), p, s);
    return new Paginated(items.map(toResponse), buildPagination(p, s, total));
  }

  @Patch('admin/affiliates/:id/review')
  @RequireCapability(CAPABILITY.MODULE_ACCOUNTING)
  @ApiOperation({ summary: 'Approve or reject an affiliate application' })
  async review(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReviewRequest,
  ) {
    const affiliate = await this.affiliateService.review(this.tenantId(user), id, body.decision);
    return toResponse(affiliate);
  }

  private tenantId(user: Principal): number {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return user.tenantId;
  }
}
