export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Conversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string };
const storageKey = 'lekka_chat_history';
export function newConversationId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadConversations(): Conversation[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Conversation =>
      typeof item?.id === 'string' && typeof item.title === 'string' &&
      typeof item.updatedAt === 'string' && Array.isArray(item.messages) &&
      item.messages.every((message: ChatMessage) =>
        (message?.role === 'user' || message?.role === 'assistant') && typeof message.content === 'string'
      )
    );
  } catch { return []; }
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(storageKey, JSON.stringify(conversations));
}
