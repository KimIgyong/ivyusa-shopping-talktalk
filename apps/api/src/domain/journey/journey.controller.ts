import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { JourneyReportService } from './journey-report.service';
import { JourneyCriteriaService } from './journey-criteria.service';
import { JourneyMapper } from './journey.mapper';
import {
  CompareJourneyReportsRequest,
  CreateJourneyReportRequest,
  SaveJourneyCriteriaRequest,
} from './dto/request/journey.request';

/** Customer journey reports (PLN-260825). Same holders as live chat. */
@ApiTags('Journey')
@Controller('journey')
export class JourneyController {
  constructor(
    private readonly reports: JourneyReportService,
    private readonly criteria: JourneyCriteriaService,
  ) {}

  private tenantUser(user: Principal): { tenantId: number; userId: number } {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return { tenantId: user.tenantId, userId: user.userId };
  }

  @Get('groups/:groupId/reports')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: "A group's reports, newest first" })
  async list(@CurrentUser() user: Principal, @Param('groupId', ParseIntPipe) groupId: number) {
    const rows = await this.reports.list(this.tenantUser(user).tenantId, groupId);
    return JourneyMapper.toReportList(rows);
  }

  @Post('groups/:groupId/reports')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Start a report; it is written after this returns' })
  async create(
    @CurrentUser() user: Principal,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: CreateJourneyReportRequest,
  ) {
    const actor = this.tenantUser(user);
    const row = await this.reports.request(
      actor.tenantId,
      groupId,
      { from: body.period_from ?? null, to: body.period_to ?? null },
      actor.userId,
    );
    return JourneyMapper.toReport(row);
  }

  @Get('reports/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'One report, with its body once ready' })
  async get(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return JourneyMapper.toReport(await this.reports.get(this.tenantUser(user).tenantId, id), true);
  }

  @Post('reports/compare')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Compare two finished reports' })
  async compare(@CurrentUser() user: Principal, @Body() body: CompareJourneyReportsRequest) {
    const actor = this.tenantUser(user);
    const row = await this.reports.requestComparison(actor.tenantId, body.report_ids, actor.userId);
    return JourneyMapper.toReport(row);
  }

  @Delete('reports/:id')
  @RequireCapability(CAPABILITY.CONVERSATION_HANDLE)
  @ApiOperation({ summary: 'Hide a report — comparisons still reference their inputs' })
  async hide(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.reports.hide(this.tenantUser(user).tenantId, id);
    return { hidden: true };
  }

  @Get('criteria')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Current writing criteria and its version history' })
  async criteriaList(@CurrentUser() user: Principal) {
    const actor = this.tenantUser(user);
    const [current, history] = await Promise.all([
      this.criteria.current(actor.tenantId, actor.userId),
      this.criteria.list(actor.tenantId),
    ]);
    return {
      current: JourneyMapper.toCriteria(current),
      history: history.map((c) => JourneyMapper.toCriteria(c)),
    };
  }

  @Put('criteria')
  @RequireCapability(CAPABILITY.TENANT_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Save as a new version; past reports keep the one they used' })
  async saveCriteria(@CurrentUser() user: Principal, @Body() body: SaveJourneyCriteriaRequest) {
    const actor = this.tenantUser(user);
    const saved = await this.criteria.save(
      actor.tenantId,
      {
        sectionsJson: body.sections,
        topQuestionsN: body.top_questions_n,
        sampleCap: body.sample_cap,
        quoteMaxChars: body.quote_max_chars,
        tone: body.tone,
        bannedJson: body.banned,
      },
      actor.userId,
    );
    return JourneyMapper.toCriteria(saved);
  }
}
