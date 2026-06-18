import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY } from '@ivy/types';
import { IntegrationService } from './integration.service';
import { UpsertIntegrationStatusRequest } from './dto/request/integration.request';
import { AdminOnly, RequireCapability } from '../../global/decorator/auth.decorator';

@ApiTags('Integration')
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get('status')
  @RequireCapability(CAPABILITY.ANALYTICS_READ)
  @ApiOperation({ summary: 'List integration connection statuses' })
  async listStatus() {
    return this.integrationService.listStatus();
  }

  @Patch('status/:name')
  @AdminOnly()
  @ApiOperation({ summary: 'Upsert an integration status (sets last_sync_at)' })
  async upsertStatus(
    @Param('name') name: string,
    @Body() body: UpsertIntegrationStatusRequest,
  ) {
    return this.integrationService.upsert(name, body.status, body.detail);
  }
}
