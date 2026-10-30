import { SkillService } from '../ai/skillService';

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }

export class ChatService {
  static async processChatMessage(params: { sessionId: string; userMessage: string; clientState?: any; history?: ChatMessage[] }) {
    // Client snapshots and pending local writes are not financial evidence.
    const history = Array.isArray(params.history) ? params.history.filter(row => row && ['user', 'assistant'].includes(row.role) && typeof row.content === 'string').slice(-4) : [];
    return SkillService.respond(params.userMessage, history);
  }
  static clearSessionHistory(_sessionId: string) {
    // Conversations are persisted and cleared by the existing client, not a serverless RAM cache.
  }
}
