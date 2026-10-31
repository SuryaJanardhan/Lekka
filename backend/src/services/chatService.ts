import { SkillService } from '../ai/skillService';
import type { SkillRequest } from '../ai/contract';

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }

export class ChatService {
  static async processChatMessage(params: { sessionId: string; userMessage: string; clientState?: any; history?: ChatMessage[]; context?: SkillRequest }) {
    // Client snapshots and pending local writes are not financial evidence.
    const history = Array.isArray(params.history) ? params.history.filter(row => row && ['user', 'assistant'].includes(row.role) && typeof row.content === 'string').slice(-4) : [];
    return SkillService.respond(params.userMessage, history, params.context);
  }
  static clearSessionHistory(_sessionId: string) {
    // Conversations are persisted and cleared by the existing client, not a serverless RAM cache.
  }
}
