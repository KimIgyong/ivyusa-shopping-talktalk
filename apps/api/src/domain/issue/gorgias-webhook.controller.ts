import { Body, Controller, Headers, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalTicketService } from './external-ticket.service';
import { Public } from '../../global/decorator/public.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Gorgias L2 status webhook (PLN-260809-Issue-Workflow-P3 S3). The tenant's
 * Gorgias HTTP Integration posts ticket-updated here with the shared token
 * (header `x-shoptalk-token` or `?token=`) configured as the connector's
 * webhook_secret — see docs/guide/GORGIAS-CONNECTOR.md.
 */
@ApiTags('Webhooks')
@Controller('webhooks/gorgias')
export class GorgiasWebhookController {
  constructor(private readonly externalTickets: ExternalTicketService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Gorgias ticket-updated → mirror status, notify on close' })
  async ticketUpdated(
    @Body() body: { ticket?: { id?: number | string; status?: string } },
    @Headers('x-shoptalk-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    const ok = await this.externalTickets.handleWebhook(
      headerToken ?? queryToken ?? '',
      String(body?.ticket?.id ?? ''),
      String(body?.ticket?.status ?? ''),
    );
    if (!ok) {
      // 4xx are not server-logged by default — the service already warns; reject.
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
    return { ok: true };
  }
}
