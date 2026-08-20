import { AiAgent } from './entity/ai-agent.entity';

export interface AiAgentResponse {
  id: number;
  code: string;
  name: string;
  persona: string | null;
  rules: string[];
  active: boolean;
  isDefault: boolean;
  updatedAt: Date;
}

export class AiAgentMapper {
  static toResponse(row: AiAgent): AiAgentResponse {
    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      persona: row.persona,
      rules: row.rules ?? [],
      active: row.active === 1,
      isDefault: row.isDefault === 1,
      updatedAt: row.updatedAt,
    };
  }
}
