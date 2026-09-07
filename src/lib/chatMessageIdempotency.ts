export type ChatMessageOperation = {
  key: string;
  messageId: string;
  reused: boolean;
};

type OperationRecord = {
  messageId: string;
  expiresAt: number;
};

const SUCCESS_GRACE_MS = 1_500;
const UNCERTAIN_RETRY_MS = 30_000;

function operationKey(input: { uid: string; chatId: string; text: string; imageUrl?: string }) {
  // Memory-only exact key. It is never persisted or logged, so message content does
  // not leak into localStorage/telemetry while still avoiding hash collisions.
  return `${input.uid}\u0000${input.chatId}\u0000${input.text}\u0000${input.imageUrl || ''}`;
}

function newMessageId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `msg-${random}`;
}

export class ChatMessageIdempotencyWindow {
  private operations = new Map<string, OperationRecord>();

  constructor(
    private readonly successGraceMs = SUCCESS_GRACE_MS,
    private readonly uncertainRetryMs = UNCERTAIN_RETRY_MS,
    private readonly idFactory: () => string = newMessageId,
  ) {}

  begin(input: { uid: string; chatId: string; text: string; imageUrl?: string }, nowMs = Date.now()): ChatMessageOperation {
    this.prune(nowMs);
    const key = operationKey(input);
    const existing = this.operations.get(key);
    if (existing && existing.expiresAt > nowMs) return { key, messageId: existing.messageId, reused: true };
    const messageId = this.idFactory();
    this.operations.set(key, { messageId, expiresAt: nowMs + this.uncertainRetryMs });
    return { key, messageId, reused: false };
  }

  markSuccess(key: string, nowMs = Date.now()) {
    const current = this.operations.get(key);
    if (!current) return;
    this.operations.set(key, { ...current, expiresAt: nowMs + this.successGraceMs });
  }

  markUncertain(key: string, nowMs = Date.now()) {
    const current = this.operations.get(key);
    if (!current) return;
    this.operations.set(key, { ...current, expiresAt: nowMs + this.uncertainRetryMs });
  }

  forget(key: string) {
    this.operations.delete(key);
  }

  private prune(nowMs: number) {
    for (const [key, value] of this.operations) if (value.expiresAt <= nowMs) this.operations.delete(key);
  }
}

export const CHAT_MESSAGE_IDEMPOTENCY = {
  success_grace_ms: SUCCESS_GRACE_MS,
  uncertain_retry_ms: UNCERTAIN_RETRY_MS,
  persisted: false,
  stores_message_content_outside_memory: false,
} as const;
