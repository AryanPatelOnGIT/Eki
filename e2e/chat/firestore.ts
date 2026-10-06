type Message = { id: string; text: string; from: string; senderName: string; senderId: string; timestamp: null };
type Listener = (snapshot: { docs: { id: string; data: () => Omit<Message, "id"> }[]; metadata: { fromCache: boolean } }) => void;
let listener: Listener | null = null;

export class Timestamp {}
export const collection = (...parts: unknown[]) => parts;
export const orderBy = (...parts: unknown[]) => parts;
export const limitToLast = (count: number) => count;
export const query = (...parts: unknown[]) => parts;
export function onSnapshot(_query: unknown, _options: unknown, next: Listener) {
  listener = next;
  return () => { if (listener === next) listener = null; };
}
export function publishMessages(messages: Message[]) {
  if (!listener) throw new Error("Chat listener is not attached yet.");
  listener({
    docs: messages.map(({ id, ...data }) => ({ id, data: () => data })),
    metadata: { fromCache: false },
  });
}
