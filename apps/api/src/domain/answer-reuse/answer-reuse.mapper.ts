import { AnswerReuse } from './entity/answer-reuse.entity';
import { AnswerReuseItemResponse } from './dto/response/answer-reuse.response';

/** Entity → console response (camelCase). */
export class AnswerReuseMapper {
  static toItem(r: AnswerReuse): AnswerReuseItemResponse {
    return {
      id: String(r.id),
      lang: r.lang,
      questionText: r.questionText,
      answerText: r.answerText,
      source: r.source,
      confidence: r.confidence,
      active: r.active === 1,
      hitCount: r.hitCount,
      lastHitAt: r.lastHitAt ? new Date(r.lastHitAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    };
  }
}
