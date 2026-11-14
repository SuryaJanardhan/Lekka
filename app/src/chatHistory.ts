import { decryptJson, encryptJson, isEncryptedPayload } from './localCrypto';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Conversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string; context?: Record<string, unknown> };
const storageKey = 'lekka_chat_history';
export function newConversationId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Conversation =>
    typeof item?.id === 'string' && typeof item.title === 'string' &&
    typeof item.updatedAt === 'string' && Array.isArray(item.messages) &&
    item.messages.every((message: ChatMessage) =>
      (message?.role === 'user' || message?.role === 'assistant') && typeof message.content === 'string'
    )
  );
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (isEncryptedPayload(stored)) return validConversations(await decryptJson(stored));
    const conversations = validConversations(stored);
    if (conversations.length) await saveConversations(conversations);
    return conversations;
  } catch { return []; }
}

export async function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(storageKey, JSON.stringify(await encryptJson(conversations)));
}
