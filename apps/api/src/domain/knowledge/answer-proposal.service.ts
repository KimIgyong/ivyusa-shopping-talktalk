import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbAnswerProposal, PROPOSAL_STATUS } from './entity/kb-answer-proposal.entity';
import { KnowledgeService } from './knowledge.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Category an approved answer lands under unless the approver picks another. */
const DEFAULT_CATEGORY = 'faq';
/** Titles come from the question; the column is 255. */
const MAX_TITLE = 120;

export interface ProposalInput {
  conversationId: number | null;
  question: string;
  answer: string;
}

export interface ApprovalInput {
  /** Approver's edits — an answer worth keeping is often worth tightening first. */
  title?: string;
  category?: string;
  answer?: string;
}

/**
 * Answer proposals and their review (PLN-260810 S4, decision D3).
 *
 * Chat handlers find the gaps; knowledge owners decide what becomes knowledge.
 * Without this queue the choice was between granting every agent document
 * write access and letting good answers die in the thread they were written in.
 */
@Injectable()
export class AnswerProposalService {
  private readonly logger = new Logger(AnswerProposalService.name);

  constructor(
    @InjectRepository(KbAnswerProposal)
    private readonly proposalRepo: Repository<KbAnswerProposal>,
    private readonly knowledge: KnowledgeService,
  ) {}

  /** Queue an answer for review. */
  async propose(
    tenantId: number,
    input: ProposalInput,
    proposedBy: number,
  ): Promise<KbAnswerProposal> {
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim();
    if (!question || !answer) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    // Two agents hitting the same gap in the same thread is one proposal, not
    // two entries a reviewer has to compare.
    const duplicate = await this.proposalRepo.findOne({
      where: {
        tenantId,
        conversationId: input.conversationId ?? undefined,
        question,
        status: PROPOSAL_STATUS.PENDING,
      },
    });
    if (duplicate) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    }

    const saved = await this.proposalRepo.save(
      this.proposalRepo.create({
        tenantId,
        conversationId: input.conversationId,
        question,
        answer,
        status: PROPOSAL_STATUS.PENDING,
        proposedBy,
      }),
    );
    this.logger.log(`answer proposal ${saved.id} queued by user ${proposedBy}`);
    return saved;
  }

  /** Review queue, oldest first — the longest-waiting proposal is the one at risk. */
  async list(tenantId: number, status: string = PROPOSAL_STATUS.PENDING): Promise<KbAnswerProposal[]> {
    return this.proposalRepo.find({
      where: { tenantId, status },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  async pendingCount(tenantId: number): Promise<number> {
    return this.proposalRepo.count({ where: { tenantId, status: PROPOSAL_STATUS.PENDING } });
  }

  /**
   * Approve: the answer becomes a knowledge document and is indexed at once,
   * so the next customer asking the same thing gets it.
   */
  async approve(
    tenantId: number,
    id: number,
    edits: ApprovalInput,
    decidedBy: number,
  ): Promise<KbAnswerProposal> {
    const proposal = await this.requirePending(tenantId, id);
    const answer = (edits.answer ?? proposal.answer).trim();
    if (!answer) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);

    const document = await this.knowledge.createDocument(
      tenantId,
      {
        title: (edits.title?.trim() || proposal.question).slice(0, MAX_TITLE),
        category: edits.category?.trim() || DEFAULT_CATEGORY,
        content: answer,
        // Provenance: the conversation this answer was written in.
        source_url: proposal.conversationId ? `/live-chat?c=${proposal.conversationId}` : undefined,
      } as never,
      decidedBy,
    );

    proposal.status = PROPOSAL_STATUS.APPROVED;
    proposal.answer = answer;
    proposal.decidedBy = decidedBy;
    proposal.decidedAt = new Date();
    proposal.documentId = Number(document.id);
    const saved = await this.proposalRepo.save(proposal);
    this.logger.log(`answer proposal ${id} approved by ${decidedBy} → document ${document.id}`);
    return saved;
  }

  /**
   * Reject with a reason. The reason is required: a refusal nobody can explain
   * comes back next week as the same proposal.
   */
  async reject(
    tenantId: number,
    id: number,
    reason: string,
    decidedBy: number,
  ): Promise<KbAnswerProposal> {
    const trimmed = reason?.trim() ?? '';
    if (!trimmed) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);

    const proposal = await this.requirePending(tenantId, id);
    proposal.status = PROPOSAL_STATUS.REJECTED;
    proposal.rejectReason = trimmed.slice(0, 500);
    proposal.decidedBy = decidedBy;
    proposal.decidedAt = new Date();
    const saved = await this.proposalRepo.save(proposal);
    this.logger.log(`answer proposal ${id} rejected by ${decidedBy}`);
    return saved;
  }

  /** Decisions are final — a second reviewer must not silently overwrite the first. */
  private async requirePending(tenantId: number, id: number): Promise<KbAnswerProposal> {
    const proposal = await this.proposalRepo.findOne({ where: { id, tenantId } });
    if (!proposal) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (proposal.status !== PROPOSAL_STATUS.PENDING) {
      this.logger.warn(`proposal ${id} already ${proposal.status}`);
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    }
    return proposal;
  }
}
