import type { ChatMessage } from '../types';

// A server-acknowledged operation has a canonical Firestore message ID.
// Never guess that two messages are identical based on their body or timestamp:
// users can legitimately send the same text twice.
export function acknowledgeOptimisticChatMessage(
  messages: ChatMessage[], localId: string, serverId: string,
): ChatMessage[] {
  if (!localId.startsWith('msg-local') || !serverId.startsWith('msg-')
    || serverId.startsWith('msg-local') || localId === serverId) return messages;
  const alreadyCanonical = messages.some((message) => message.id === serverId);
  let inserted = false;
  const next: ChatMessage[] = [];
  for (const message of messages) {
    if (message.id === localId) {
      if (alreadyCanonical || inserted) continue;
      next.push({ ...message, id: serverId });
      inserted = true;
    } else {
      if (message.id === serverId) {
        if (inserted) continue;
        inserted = true;
      }
      next.push(message);
    }
  }
  return next;
}
