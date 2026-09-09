import { z } from "zod";

export const COLLABORATION_ROLES = [
  "artist",
  "vocalist",
  "producer",
  "beatmaker",
  "songwriter",
  "lyricist",
  "engineer",
  "mixing_engineer",
  "mastering_engineer",
  "videographer",
  "dj",
  "label",
  "manager",
  "designer",
  "other"
] as const;

export const COLLABORATION_INTENTS = [
  "find_producer",
  "find_artist",
  "find_beatmaker",
  "find_songwriter",
  "find_engineer",
  "find_videographer",
  "find_label",
  "find_manager",
  "feature",
  "remix",
  "distribution",
  "other"
] as const;

export const COLLABORATION_PREFERENCES = [
  "remote",
  "local",
  "hybrid"
] as const;

export const COLLABORATION_STATUSES = [
  "open",
  "closed"
] as const;

export const COLLABORATION_WORKFLOWS = [
  "seeking",
  "offering"
] as const;

export const COLLABORATION_INTENT_CATEGORIES = [
  "LOOKING_FOR_PERSON",
  "LOOKING_FOR_COLLABORATION",
  "OFFERING_COLLABORATION",
  "OTHER"
] as const;

export type CollaborationRole = typeof COLLABORATION_ROLES[number];
export type CollaborationIntent = typeof COLLABORATION_INTENTS[number];
export type CollaborationPreference = typeof COLLABORATION_PREFERENCES[number];
export type CollaborationStatus = typeof COLLABORATION_STATUSES[number];
export type CollaborationWorkflow = typeof COLLABORATION_WORKFLOWS[number];
export type CollaborationIntentCategory = typeof COLLABORATION_INTENT_CATEGORIES[number];

const COLLABORATION_ROLE_LABELS: Record<CollaborationRole, string> = {
  artist: "Артист",
  vocalist: "Вокалист",
  producer: "Продюсер",
  beatmaker: "Битмейкер",
  songwriter: "Сонграйтер",
  lyricist: "Автор текста",
  engineer: "Звукорежиссёр",
  mixing_engineer: "Звукорежиссёр сведения",
  mastering_engineer: "Мастеринг-инженер",
  videographer: "Видеограф",
  dj: "DJ",
  label: "Лейбл",
  manager: "Менеджер",
  designer: "Дизайнер",
  other: "Другое"
};

const COLLABORATION_INTENT_LABELS: Record<CollaborationIntent, string> = {
  find_producer: "Ищу продюсера",
  find_artist: "Ищу артиста",
  find_beatmaker: "Ищу битмейкера",
  find_songwriter: "Ищу сонграйтера",
  find_engineer: "Ищу звукорежиссёра",
  find_videographer: "Ищу видеографа",
  find_label: "Ищу лейбл",
  find_manager: "Ищу менеджера",
  feature: "Ищу фит / совместный трек",
  remix: "Ищу ремикс",
  distribution: "Ищу дистрибуцию",
  other: "Ищу сотрудничество"
};

const COLLABORATION_INTENT_CATEGORY_BY_INTENT: Record<CollaborationIntent, CollaborationIntentCategory> = {
  find_producer: "LOOKING_FOR_PERSON",
  find_artist: "LOOKING_FOR_PERSON",
  find_beatmaker: "LOOKING_FOR_PERSON",
  find_songwriter: "LOOKING_FOR_PERSON",
  find_engineer: "LOOKING_FOR_PERSON",
  find_videographer: "LOOKING_FOR_PERSON",
  find_manager: "LOOKING_FOR_PERSON",
  feature: "LOOKING_FOR_COLLABORATION",
  remix: "LOOKING_FOR_COLLABORATION",
  find_label: "OTHER",
  distribution: "OTHER",
  other: "OTHER"
};

const DEFAULT_COLLABORATION_INTENT_LABEL = "Ищу сотрудничество";
const DEFAULT_COLLABORATION_ROLE_LABEL = "Другое";
const DEFAULT_COLLABORATION_INTENT_ICON = "🤝";
const DEFAULT_COLLABORATION_ROLE_ICON = "🎵";

const COLLABORATION_ROLE_ICONS: Record<CollaborationRole, string> = {
  artist: "🎤",
  vocalist: "🎤",
  producer: "🎛",
  beatmaker: "🥁",
  songwriter: "🎼",
  lyricist: "✍️",
  engineer: "🎚",
  mixing_engineer: "🎚",
  mastering_engineer: "🎚",
  videographer: "🎬",
  dj: "🎧",
  label: "🏷",
  manager: "💼",
  designer: "🎨",
  other: "🎵"
};

const COLLABORATION_INTENT_ICONS: Record<CollaborationIntent, string> = {
  find_producer: "🎛",
  find_artist: "🎧",
  find_beatmaker: "🥁",
  find_songwriter: "🎼",
  find_engineer: "🎚",
  find_videographer: "🎬",
  find_label: "🏷",
  find_manager: "💼",
  feature: "🎤",
  remix: "🔄",
  distribution: "📡",
  other: "🤝"
};

export type CollaborationPresentation = {
  rawIntent: string | null;
  intent: CollaborationIntent | null;
  workflow: CollaborationWorkflow;
  intentCategory: CollaborationIntentCategory;
  displayIntent: string;
  rawRole: string | null;
  role: CollaborationRole | null;
  displayRole: string;
  customIntentLabel: string;
  legacyFallback: boolean;
};

export const collaborationProfileSchema = z.object({
  open: z.boolean().default(false),
  role: z.enum(COLLABORATION_ROLES).default("artist"),
  genres: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  intents: z.array(z.enum(COLLABORATION_INTENTS)).max(8).default([]),
  preference: z.enum(COLLABORATION_PREFERENCES).default("hybrid"),
  bio: z.string().trim().max(300).default("")
});

export type CollaborationProfile = z.infer<typeof collaborationProfileSchema>;

export const collaborationPostMetadataSchema = z.object({
  intent: z.enum(COLLABORATION_INTENTS),
  role: z.enum(COLLABORATION_ROLES),
  status: z.enum(COLLABORATION_STATUSES).default("open"),
  workflow: z.enum(COLLABORATION_WORKFLOWS).default("seeking"),
  customIntentLabel: z.string().trim().max(80).optional().default(""),
  genres: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  preference: z.enum(COLLABORATION_PREFERENCES),
  city: z.string().trim().max(80).optional().default(""),
  bio: z.string().trim().max(300).default("")
});

export type CollaborationPostMetadata = z.infer<typeof collaborationPostMetadataSchema>;

export function normalizeCollaborationCity(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 80);
}

export const POST_MEDIA_ROLES = [
  "standard",
  "demo"
] as const;

export type PostMediaRole = typeof POST_MEDIA_ROLES[number];

export const postMediaItemSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  mediaType: z.enum(["image", "audio", "video"]),
  mediaKey: z.string().trim().min(1).max(500),
  mediaName: z.string().trim().max(255).default(""),
  role: z.enum(POST_MEDIA_ROLES).default("standard"),
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
  posterKey: z.string().trim().max(500).optional(),
  posterUrl: z.string().trim().max(2_000).optional()
}).superRefine((value, context) => {
  if (value.role === "demo" && value.mediaType !== "audio") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Demo поддерживается только для аудио",
      path: ["role"]
    });
  }
});

export type PostMediaItem = z.infer<typeof postMediaItemSchema>;

const STRUCTURED_POST_PREFIX = "[[ICM_POST_META_V1]]";

type StructuredPostPayload = {
  type: "collaboration" | "post";
  collaboration?: CollaborationPostMetadata;
  mediaItems?: PostMediaItem[];
};

export type ParsedStructuredPost = {
  content: string;
  postType: "standard" | "collaboration";
  collaboration: CollaborationPostMetadata | null;
  mediaItems: PostMediaItem[];
};

function sanitizeList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 8);
}

export function normalizeCollaborationGenres(values: string[]) {
  return sanitizeList(values);
}

export function parseDelimitedList(value: string) {
  return sanitizeList(value.split(","));
}

export function formatDelimitedList(values: string[]) {
  return sanitizeList(values).join(", ");
}

export function isCollaborationIntent(value: string): value is CollaborationIntent {
  return (COLLABORATION_INTENTS as readonly string[]).includes(value);
}

export function isCollaborationRole(value: string): value is CollaborationRole {
  return (COLLABORATION_ROLES as readonly string[]).includes(value);
}

export function parseCollaborationIntentValue(value: string | null | undefined): CollaborationIntent | null {
  const normalized = value?.trim() ?? "";
  return normalized && isCollaborationIntent(normalized) ? normalized : null;
}

export function parseCollaborationRoleValue(value: string | null | undefined): CollaborationRole | null {
  const normalized = value?.trim() ?? "";
  return normalized && isCollaborationRole(normalized) ? normalized : null;
}

export function encodeStructuredPostContent(params: {
  content: string;
  collaboration?: CollaborationPostMetadata | null;
  mediaItems?: PostMediaItem[];
}) {
  const trimmedContent = params.content.trim();
  const mediaItems = (params.mediaItems ?? [])
    .map((item) => postMediaItemSchema.parse(item))
    .slice(0, 8);
  if (!params.collaboration && !mediaItems.length) return trimmedContent;
  const payload: StructuredPostPayload = {
    type: params.collaboration ? "collaboration" : "post",
    mediaItems: mediaItems.length ? mediaItems : undefined,
    collaboration: params.collaboration ? {
      ...params.collaboration,
      genres: normalizeCollaborationGenres(params.collaboration.genres)
    } : undefined
  };
  return `${STRUCTURED_POST_PREFIX}${JSON.stringify(payload)}\n\n${trimmedContent}`;
}

export function parseStructuredPostContent(rawContent: string | null | undefined): ParsedStructuredPost {
  const source = typeof rawContent === "string" ? rawContent : "";
  if (!source.startsWith(STRUCTURED_POST_PREFIX)) {
    return {
      content: source,
      postType: "standard",
      collaboration: null,
      mediaItems: []
    };
  }

  const separatorIndex = source.indexOf("\n\n");
  if (separatorIndex < 0) {
    return {
      content: source,
      postType: "standard",
      collaboration: null,
      mediaItems: []
    };
  }

  const rawJson = source.slice(STRUCTURED_POST_PREFIX.length, separatorIndex).trim();
  const body = source.slice(separatorIndex + 2);
  try {
    const parsed = JSON.parse(rawJson) as StructuredPostPayload;
    const mediaItems = z.array(postMediaItemSchema).max(8).safeParse(parsed?.mediaItems ?? []);
    const collaboration = collaborationPostMetadataSchema.safeParse(parsed?.collaboration);
    if (!collaboration.success) {
      return {
        content: body,
        postType: "standard",
        collaboration: null,
        mediaItems: mediaItems.success ? mediaItems.data : []
      };
    }
    return {
      content: body,
      postType: "collaboration",
      collaboration: collaboration.data,
      mediaItems: mediaItems.success ? mediaItems.data : []
    };
  } catch {
    return {
      content: body,
      postType: "standard",
      collaboration: null,
      mediaItems: []
    };
  }
}

export function collaborationRoleLabel(role: CollaborationRole) {
  return COLLABORATION_ROLE_LABELS[role];
}

export function collaborationIntentLabel(intent: CollaborationIntent) {
  return COLLABORATION_INTENT_LABELS[intent];
}

export function collaborationRoleIcon(role: CollaborationRole) {
  return COLLABORATION_ROLE_ICONS[role];
}

export function collaborationIntentIcon(intent: CollaborationIntent) {
  return COLLABORATION_INTENT_ICONS[intent];
}

export function collaborationIntentCategory(value: CollaborationIntent | string | null | undefined): CollaborationIntentCategory {
  const intent = typeof value === "string" ? parseCollaborationIntentValue(value) : value;
  return intent ? COLLABORATION_INTENT_CATEGORY_BY_INTENT[intent] : "OTHER";
}

export function collaborationIntentLabelFromUnknown(value: CollaborationIntent | string | null | undefined) {
  const intent = typeof value === "string" ? parseCollaborationIntentValue(value) : value;
  return intent ? collaborationIntentLabel(intent) : DEFAULT_COLLABORATION_INTENT_LABEL;
}

export function collaborationRoleLabelFromUnknown(value: CollaborationRole | string | null | undefined) {
  const role = typeof value === "string" ? parseCollaborationRoleValue(value) : value;
  return role ? collaborationRoleLabel(role) : DEFAULT_COLLABORATION_ROLE_LABEL;
}

export function collaborationIntentIconFromUnknown(value: CollaborationIntent | string | null | undefined) {
  const intent = typeof value === "string" ? parseCollaborationIntentValue(value) : value;
  return intent ? collaborationIntentIcon(intent) : DEFAULT_COLLABORATION_INTENT_ICON;
}

export function collaborationRoleIconFromUnknown(value: CollaborationRole | string | null | undefined) {
  const role = typeof value === "string" ? parseCollaborationRoleValue(value) : value;
  return role ? collaborationRoleIcon(role) : DEFAULT_COLLABORATION_ROLE_ICON;
}

export function buildCollaborationPresentation(input: {
  intent?: string | null;
  role?: string | null;
  workflow?: CollaborationWorkflow | string | null;
  customIntentLabel?: string | null;
}): CollaborationPresentation {
  const rawIntent = input.intent?.trim() ?? null;
  const rawRole = input.role?.trim() ?? null;
  const workflow = input.workflow === "offering" ? "offering" : "seeking";
  const intent = parseCollaborationIntentValue(rawIntent);
  const role = parseCollaborationRoleValue(rawRole);
  const customIntentLabel = input.customIntentLabel?.trim() ?? "";
  const intentCategory = workflow === "offering"
    ? "OFFERING_COLLABORATION"
    : collaborationIntentCategory(intent);
  const defaultDisplayIntent = collaborationIntentLabelFromUnknown(intent ?? rawIntent);
  const displayIntent = customIntentLabel
    ? workflow === "offering"
      ? `Предлагаю: ${customIntentLabel}`
      : customIntentLabel
    : workflow === "offering"
      ? "Предлагаю участие"
      : defaultDisplayIntent;
  return {
    rawIntent,
    intent,
    workflow,
    intentCategory,
    displayIntent,
    rawRole,
    role,
    displayRole: collaborationRoleLabelFromUnknown(role ?? rawRole),
    customIntentLabel,
    legacyFallback: !intent || !role
  };
}

export function buildCollaborationSearchText(input: {
  content?: string | null;
  collaboration?: {
    intent?: string | null;
    role?: string | null;
    workflow?: CollaborationWorkflow | string | null;
    customIntentLabel?: string | null;
    status?: CollaborationStatus | string | null;
    preference?: CollaborationPreference | string | null;
    city?: string | null;
    genres?: string[] | null;
    bio?: string | null;
  } | null;
  linkedRelease?: {
    title?: string | null;
    artistName?: string | null;
    platformLinks?: Array<{ label?: string | null; href?: string | null; code?: string | null }> | null;
  } | null;
  author?: {
    displayName?: string | null;
    slug?: string | null;
  } | null;
}) {
  const collaboration = input.collaboration;
  const presentation = buildCollaborationPresentation({
    intent: collaboration?.intent ?? null,
    role: collaboration?.role ?? null,
    workflow: collaboration?.workflow ?? null,
    customIntentLabel: collaboration?.customIntentLabel ?? null
  });
  const statusLabel = collaboration?.status === "closed" ? "Закрыто" : "Открыто";
  const preferenceLabel = collaboration?.preference === "remote"
    ? "Remote"
    : collaboration?.preference === "local"
      ? "Local"
      : "Remote Local";
  return [
    input.content ?? "",
    input.author?.displayName ?? "",
    input.author?.slug ?? "",
    presentation.rawIntent ?? "",
    presentation.displayIntent,
    presentation.workflow,
    presentation.intentCategory.replace(/_/gu, " "),
    presentation.rawRole ?? "",
    presentation.displayRole,
    collaboration?.customIntentLabel ?? "",
    collaboration?.status ?? "",
    statusLabel,
    collaboration?.preference ?? "",
    preferenceLabel,
    collaboration?.city ?? "",
    ...(collaboration?.genres ?? []),
    collaboration?.bio ?? "",
    input.linkedRelease?.title ?? "",
    input.linkedRelease?.artistName ?? "",
    ...(input.linkedRelease?.platformLinks ?? []).flatMap((platform) => [
      platform.label ?? "",
      platform.code ?? "",
      platform.href ?? ""
    ])
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function collaborationPreferenceLabel(value: CollaborationPreference) {
  switch (value) {
    case "remote": return "Remote";
    case "local": return "Локально";
    default: return "Remote / Local";
  }
}

export function collaborationStatusLabel(value: CollaborationStatus) {
  return value === "closed" ? "Закрыто" : "Открыто";
}
