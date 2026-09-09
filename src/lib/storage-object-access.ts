const PUBLIC_CATALOG_ROOTS = new Set(["previews", "covers", "uploads", "tracks", "audio", "audios"]);
const PUBLIC_USER_ROOTS = new Set(["artist-social", "artist-profiles"]);
const USER_WRITABLE_ROOTS = new Set(["artist-social", "artist-profiles", "uploads", "previews", "covers", "private"]);

export type StorageObjectPolicy = {
  ownerKind: "public" | "user" | "system";
  ownerId: string | null;
  read: "public" | "owner" | "dedicated-route";
  write: "owner" | "system" | "none";
};

export type StorageAuthorizationDecision =
  | { allowed: true; policy: StorageObjectPolicy }
  | { allowed: false; status: 401 | 403; reason: "authentication_required" | "foreign_owner" | "forbidden" };

function normalizeStorageKey(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\\/g, "/");
}

function decodeStorageSegment(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(decoded) ||
    /%(?:2e|2f|5c)/iu.test(decoded)
  ) {
    return null;
  }
  return decoded;
}

export function normalizeStorageKeySegments(segments: string[] | undefined): string[] | null {
  if (!segments?.length) return null;
  const normalized: string[] = [];
  for (const segment of segments) {
    const decoded = decodeStorageSegment(segment);
    if (!decoded) return null;
    normalized.push(decoded);
  }
  return normalized;
}

function normalizePolicyKey(value: string): string | null {
  const raw = value.trim().replace(/^\/+/, "");
  if (!raw || raw.includes("\\")) return null;
  const normalized = normalizeStorageKeySegments(raw.split("/"));
  return normalized?.join("/") ?? null;
}

function userOwnedPolicy(ownerId: string, read: "public" | "owner"): StorageObjectPolicy {
  return { ownerKind: "user", ownerId, read, write: "owner" };
}

const SYSTEM_PRIVATE_POLICY: StorageObjectPolicy = {
  ownerKind: "system",
  ownerId: null,
  read: "dedicated-route",
  write: "system"
};

export function classifyStorageObject(value: string): StorageObjectPolicy {
  const key = normalizePolicyKey(value);
  if (!key) return SYSTEM_PRIVATE_POLICY;
  const segments = key.split("/");
  const root = segments[0] ?? "";

  if (root === "contracts") {
    const child = segments[1] ?? "";
    if (PUBLIC_CATALOG_ROOTS.has(child) && segments.length >= 3) {
      return { ownerKind: "system", ownerId: null, read: "public", write: "system" };
    }
    return SYSTEM_PRIVATE_POLICY;
  }

  if (["tracks", "audio", "audios"].includes(root) && segments.length >= 2) {
    return { ownerKind: "system", ownerId: null, read: "public", write: "system" };
  }

  if (root === "avatars" && segments.length === 2) {
    const fileName = segments[1] ?? "";
    const dotIndex = fileName.lastIndexOf(".");
    const ownerId = dotIndex > 0 ? fileName.slice(0, dotIndex) : "";
    return ownerId ? userOwnedPolicy(ownerId, "public") : SYSTEM_PRIVATE_POLICY;
  }

  if (PUBLIC_USER_ROOTS.has(root) && segments.length >= 3) {
    return userOwnedPolicy(segments[1] ?? "", "public");
  }

  if (["uploads", "previews", "covers"].includes(root) && segments.length >= 2) {
    // These roots contain legacy public catalog assets. Keys generated for a
    // user remain owner-writable because the user id occupies segment two.
    return userOwnedPolicy(segments[1] ?? "", "public");
  }

  if (root === "private" && segments.length >= 3) {
    return userOwnedPolicy(segments[1] ?? "", "owner");
  }

  return SYSTEM_PRIVATE_POLICY;
}

export function authorizeStorageWrite(value: string, principalId: string | null | undefined): StorageAuthorizationDecision {
  const key = normalizePolicyKey(value);
  if (!principalId) {
    return { allowed: false, status: 401, reason: "authentication_required" };
  }
  if (!key) return { allowed: false, status: 403, reason: "forbidden" };
  const root = key.split("/")[0] ?? "";
  const policy = classifyStorageObject(key);
  if (!USER_WRITABLE_ROOTS.has(root) && root !== "avatars") {
    return { allowed: false, status: 403, reason: "forbidden" };
  }
  if (policy.write !== "owner" || !policy.ownerId) {
    return { allowed: false, status: 403, reason: "forbidden" };
  }
  if (policy.ownerId !== principalId) {
    return { allowed: false, status: 403, reason: "foreign_owner" };
  }
  return { allowed: true, policy };
}

export function authorizeStorageRead(value: string, principalId: string | null | undefined): StorageAuthorizationDecision {
  const key = normalizePolicyKey(value);
  if (!key) return { allowed: false, status: 403, reason: "forbidden" };
  const policy = classifyStorageObject(key);
  if (policy.read === "public") return { allowed: true, policy };
  if (policy.read === "dedicated-route") {
    return { allowed: false, status: principalId ? 403 : 401, reason: principalId ? "forbidden" : "authentication_required" };
  }
  if (!principalId) return { allowed: false, status: 401, reason: "authentication_required" };
  if (policy.ownerId !== principalId) return { allowed: false, status: 403, reason: "foreign_owner" };
  return { allowed: true, policy };
}

function baseNameWithoutExtension(value: string): string {
  const fileName = value.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName).toLowerCase();
}

function uniqueMatch(matches: string[]): string | null {
  const uniqueMatches = Array.from(new Set(matches));
  return uniqueMatches.length === 1 ? (uniqueMatches[0] ?? null) : null;
}

export function selectUniqueStorageKeyFallback(input: {
  requestedKey: string;
  candidateKeys: string[];
  allowedPrefixes: readonly string[];
}): string | null {
  const requestedKey = normalizeStorageKey(input.requestedKey);
  const requestedPrefix = input.allowedPrefixes.find((prefix) => requestedKey.startsWith(prefix));
  const requestedRelativePath = requestedPrefix ? requestedKey.slice(requestedPrefix.length) : null;
  const requestedRelativeDir = requestedRelativePath?.split("/").slice(0, -1).join("/") ?? null;
  const requestedFileName = requestedKey.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
  const requestedBaseName = baseNameWithoutExtension(requestedKey);
  const candidateKeys = Array.from(
    new Set(input.candidateKeys.map(normalizeStorageKey).filter(Boolean))
  );

  if (requestedRelativePath) {
    const relativePathMatch = uniqueMatch(
      candidateKeys.filter((candidateKey) => {
        const prefix = input.allowedPrefixes.find((value) => candidateKey.startsWith(value));
        return prefix
          ? candidateKey.slice(prefix.length).toLowerCase() === requestedRelativePath.toLowerCase()
          : false;
      })
    );
    if (relativePathMatch) return relativePathMatch;

    const sameFolderBaseNameMatch = uniqueMatch(
      candidateKeys.filter((candidateKey) => {
        const prefix = input.allowedPrefixes.find((value) => candidateKey.startsWith(value));
        if (!prefix) return false;
        const relativePath = candidateKey.slice(prefix.length);
        const relativeDir = relativePath.split("/").slice(0, -1).join("/");
        return relativeDir === (requestedRelativeDir ?? "") && baseNameWithoutExtension(candidateKey) === requestedBaseName;
      })
    );
    if (sameFolderBaseNameMatch) return sameFolderBaseNameMatch;
  }

  const fileNameMatch = uniqueMatch(
    candidateKeys.filter(
      (candidateKey) =>
        (candidateKey.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "") === requestedFileName
    )
  );
  if (fileNameMatch) return fileNameMatch;

  return uniqueMatch(
    candidateKeys.filter((candidateKey) => baseNameWithoutExtension(candidateKey) === requestedBaseName)
  );
}

export function isPublicStreamableStorageKey(segments: string[]): boolean {
  const normalized = normalizeStorageKeySegments(segments);
  if (!normalized) return false;
  return classifyStorageObject(normalized.join("/")).read === "public";
}
