/**
 * Serialize native secure-store mutations by key. A fast account switch must
 * never allow an older plugin set/remove promise to finish after the new write.
 * Durable restoration stays disabled while the current write is pending.
 */
export function createNativeSessionWriteQueue(
  write: (key: string, raw: string | null) => Promise<void>,
  isCurrent: (key: string, raw: string | null) => boolean,
  onCommitted: (key: string, raw: string | null) => void,
) {
  const tails = new Map<string, Promise<void>>();
  return function queueNativeSessionWrite(key: string, raw: string | null): Promise<boolean> {
    const previous = tails.get(key) || Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      if (!isCurrent(key, raw)) return false;
      await write(key, raw);
      // A native promise may resolve after a different session becomes current.
      if (!isCurrent(key, raw)) return false;
      onCommitted(key, raw);
      return true;
    });
    const tail = task.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return task;
  };
}
