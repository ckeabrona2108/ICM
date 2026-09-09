export type ClientMutationKeyFactory = () => string;

function defaultMutationKeyFactory() {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `social-${random}`;
}

export class ClientMutationKeyStore {
  private readonly entries = new Map<string, { fingerprint: string; key: string }>();

  constructor(private readonly createKey: ClientMutationKeyFactory = defaultMutationKeyFactory) {}

  acquire(slot: string, fingerprint: string) {
    const existing = this.entries.get(slot);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const key = this.createKey();
    this.entries.set(slot, { fingerprint, key });
    return key;
  }

  invalidateIfChanged(slot: string, fingerprint: string) {
    const existing = this.entries.get(slot);
    if (existing && existing.fingerprint !== fingerprint) this.entries.delete(slot);
  }

  complete(slot: string, key: string) {
    if (this.entries.get(slot)?.key === key) this.entries.delete(slot);
  }
}

export function socialCommentMutationSlot(kind: "post" | "release", sourceId: string, parentId?: string | null) {
  return `${kind}:${sourceId}:comment:${parentId ?? "root"}`;
}

export function socialCommentFingerprint(content: string) {
  return content.trim();
}
