import { AiAgent } from './entity/ai-agent.entity';

export interface AiAgentResponse {
  id: number;
  code: string;
  name: string;
  displayName: string | null;
  persona: string | null;
  rules: string[];
  greeting: Record<string, string>;
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
      displayName: row.displayName ?? null,
      persona: row.persona,
      rules: row.rules ?? [],
      greeting: row.greeting ?? {},
      active: row.active === 1,
      isDefault: row.isDefault === 1,
      updatedAt: row.updatedAt,
    };
  }
}
