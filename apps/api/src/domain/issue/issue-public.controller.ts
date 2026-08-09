import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IssueService } from './issue.service';
import { Public } from '../../global/decorator/public.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';
import { Issue } from './entity/issue.entity';

/** Widget-facing inquiries feed (PLN-260809-Issue-Workflow-P3 S2). */
@ApiTags('Issues')
@Controller('issues')
export class IssuePublicController {
  constructor(private readonly issueService: IssueService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "The session's issues for the widget inquiries feed" })
  async list(@SessionToken() token: string) {
    const issues = await this.issueService.listForSessionToken(token);
    // Deliberately smaller than the console shape — status feed only, no
    // assignee/internal notes (they are operator-facing).
    return {
      issues: issues.map((i: Issue) => ({
        issueNo: i.issueNo,
        type: i.type,
        status: i.status,
        rejectReason: i.rejectReason,
        updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : null,
      })),
    };
  }
}
