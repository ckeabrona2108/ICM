"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import {
  WizardProvider,
  useWizard,
  type UploadedCoverRef,
  type UploadedFileRef,
  type StepId,
  type WizardData,
  type WizardSubmissionMode
} from "./wizard-context";
import { StepIntro } from "./step-intro";
import { StepInfo } from "./step-info";
import { StepTracks } from "./step-tracks";
import { StepExtras } from "./step-extras";
import { StepReview } from "./step-review";
import { StepUpload } from "./step-upload";
import { buildReleaseSubmissionData } from "./release-submission";
import type {
  ReleaseDraftSaveRequest,
  ReleaseDraftSaveResponse,
  ReleaseSubmitFailureResponse,
  ReleaseSubmitRequest,
  ReleaseSubmitSuccessResponse
} from "@/lib/api/contracts";
import type {
  ReleaseLifecycleStatus,
  ReleaseSubmissionData,
  ReleaseValidationIssue
} from "@/lib/release-policy";
import {
  mapReleaseValidationStep,
  validateReleaseSubmission
} from "@/lib/release-policy";
import { resolveDraftReleaseId, resolveReleaseSubmitMode } from "@/lib/release-wizard-mode";
import { shouldGuardUnsavedChanges } from "@/lib/wizard-dirty";
import { readPendingSubmission, savePendingSubmission, completePendingSubmission } from "@/lib/release-submission-client";
import { submitReleaseWithLatestDraft } from "@/lib/release-submit-flow";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { VerificationAccessModal } from "@/components/verification/verification-access-modal";
import { uploadBrowserBlobToStorage } from "@/lib/browser-storage-upload";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "intro", label: "Что загружаем?" },
  { id: "info", label: "Обложка и информация о релизе" },
  { id: "persons", label: "Персоны и роли" },
  { id: "codes", label: "Коды и даты релиза" },
  { id: "stores", label: "Площадки распространения" },
  { id: "tracks", label: "Загрузка аудио" },
  { id: "extras", label: "Важная информация" },
  { id: "review", label: "Проверка" },
  { id: "upload", label: "Финал" }
];

const WIZARD_TIMELINE = [
  { key: "intro", label: "Шаг 1" },
  { key: "info", label: "Шаг 2" },
  { key: "persons", label: "Шаг 3" },
  { key: "codes", label: "Шаг 4" },
  { key: "stores", label: "Шаг 5" },
  { key: "tracks", label: "Шаг 6" },
  { key: "extras", label: "Шаг 7" },
  { key: "review", label: "Шаг 8" },
  { key: "final", label: "Финал" }
] as const;

const STEP_CHROME: Record<StepId, { title: string; description: string; section: string; timelineIndex: number }> = {
  intro: {
    title: "Что загружаем?",
    description: "Выберите формат релиза и проверьте базовые условия перед заполнением карточки.",
    section: "Шаг 1",
    timelineIndex: 0
  },
  info: {
    title: "Обложка и информация о релизе",
    description: "Заполните основные метаданные релиза: обложку, название, жанр, язык и лейбл.",
    section: "Шаг 2",
    timelineIndex: 1
  },
  persons: {
    title: "Персоны и роли",
    description: "Добавьте участников релиза и назначьте им роли отдельным шагом.",
    section: "Шаг 3",
    timelineIndex: 2
  },
  codes: {
    title: "Коды и даты релиза",
    description: "Укажите UPC, партнёрский код и даты релиза в отдельном экране.",
    section: "Шаг 4",
    timelineIndex: 3
  },
  stores: {
    title: "Площадки распространения",
    description: "Настройте сервисы и страны публикации до перехода к загрузке аудио.",
    section: "Шаг 5",
    timelineIndex: 4
  },
  tracks: {
    title: "Загрузка аудио",
    description: "Загрузите WAV или FLAC, проверьте превью и приведите список треков к финальному виду.",
    section: "Шаг 6",
    timelineIndex: 5
  },
  extras: {
    title: "Важная информация",
    description: "Дополнительные параметры, настройки доставки и служебные поля, влияющие на релиз.",
    section: "Шаг 7",
    timelineIndex: 6
  },
  review: {
    title: "Проверка",
    description: "Сверьте карточку релиза, список треков и статус заполнения перед отправкой на модерацию.",
    section: "Шаг 8",
    timelineIndex: 7
  },
  upload: {
    title: "Финал",
    description: "Дождитесь окончания загрузки и перехода релиза в очередь модерации.",
    section: "Финал",
    timelineIndex: 8
  }
};

function ReleaseWizardTimeline({ step }: { step: StepId }) {
  const activeIndex = STEP_CHROME[step].timelineIndex;

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.86),rgba(13,16,30,0.82))] px-5 py-5 shadow-[var(--ux-shadow-soft)] backdrop-blur-xl sm:px-7">
      <div className="relative">
        <div className="absolute left-[18px] right-[18px] top-[18px] h-px bg-white/[0.08]" />
        <div
          className="absolute left-[18px] top-[18px] h-px bg-[var(--ux-accent)] transition-all duration-300"
          style={{ width: `calc(${Math.max(activeIndex, 0)} * ((100% - 36px) / 8))` }}
        />
        <div className="grid grid-cols-9 gap-2">
          {WIZARD_TIMELINE.map((item, index) => {
            const completed = index < activeIndex;
            const active = index == activeIndex;
            return (
              <div key={item.key} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.12em]",
                    active ? "text-[#f5efe6]" : completed ? "text-[#cfc4ff]" : "text-white/30"
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    "relative z-10 grid h-4 w-4 place-items-center rounded-full border transition-colors",
                    active && "border-[var(--ux-accent)] bg-[var(--ux-accent)] text-[#1a130f]",
                    completed && "border-[var(--ux-accent)]/75 bg-[var(--ux-accent)]/22 text-[#cfc4ff]",
                    !active && !completed && "border-white/[0.12] bg-white/[0.03] text-white/30"
                  )}
                >
                  {completed ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type WizardValidatedStep = "intro" | "info" | "persons" | "codes" | "stores" | "tracks" | "extras";
type WizardErrorSection = "release_info" | "tracks" | "stores" | "pricing";
type WizardAnchorId = "info-cover" | "info-basics" | "info-persons" | "info-codes" | "info-platforms" | "info-territories" | "tracks-upload" | "tracks-list" | "extras-general" | "extras-yandex" | "extras-comment";

const VALIDATED_STEPS: WizardValidatedStep[] = ["intro", "info", "persons", "codes", "stores", "tracks", "extras"];

type StepValidationState = {
  step: WizardValidatedStep;
  issues: ReleaseValidationIssue[];
  message: string;
  anchorId: WizardAnchorId | null;
};

function formatValidationList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

function resolveValidationMessage(issue: ReleaseValidationIssue) {
  const field = issue.field;

  if (field === "cover") return "загрузите обложку релиза";
  if (field === "title") return "укажите название релиза";
  if (field === "genre") return "выберите жанр";
  if (field === "metadataLanguage") return "выберите язык метаданных";
  if (field === "label") return "укажите лейбл";
  if (field === "releaseDate") return "укажите дату релиза";
  if (field === "originalReleaseDate") return "укажите дату оригинального релиза";
  if (field === "upc") return "укажите UPC";
  if (field === "platformMode" || field === "platforms") return "настройте площадки";
  if (field === "territoryMode" || field === "territoryCountries") return "настройте территории";
  if (field === "persons" || field.startsWith("persons.")) {
    return "добавьте хотя бы одну персону и присвойте ей роль";
  }
  if (field === "audioFiles") return "загрузите аудио";
  if (field === "tracks") return "добавьте хотя бы один трек";

  return issue.message || "заполните обязательное поле";
}

function resolveValidationAnchor(issue: ReleaseValidationIssue): WizardAnchorId | null {
  const field = issue.field;

  if (field === "cover") return "info-cover";

  if (
    field === "title" ||
    field === "subtitle" ||
    field === "genre" ||
    field === "subgenre" ||
    field === "metadataLanguage" ||
    field === "label"
  ) {
    return "info-basics";
  }

  if (field === "persons" || field.startsWith("persons.")) return "info-persons";
  if (field === "upc" || field === "releaseDate" || field === "originalReleaseDate") return "info-codes";
  if (field === "platformMode" || field === "platforms") return "info-platforms";
  if (field === "territoryMode" || field === "territoryCountries") return "info-territories";
  if (field === "audioFiles") return "tracks-upload";
  if (field === "tracks") return "tracks-list";

  return null;
}

function mapIssueToWizardStep(issue: ReleaseValidationIssue): WizardValidatedStep | null {
  if (issue.field === "yandexPreReleaseDate") return "extras";
  if (issue.field === "releaseKind" && issue.code === "invalid") {
    return "tracks";
  }
  if (issue.field === "persons" || issue.field.startsWith("persons.")) return "persons";
  if (
    issue.field === "upc" ||
    issue.field === "partnerCode" ||
    issue.field === "releaseDate" ||
    issue.field === "startDate" ||
    issue.field === "preorderDate" ||
    issue.field === "rightsYear" ||
    issue.field === "originalReleaseDate"
  ) {
    return "codes";
  }
  if (
    issue.field === "platformMode" ||
    issue.field === "platforms" ||
    issue.field === "territoryMode" ||
    issue.field === "territoryCountries"
  ) {
    return "stores";
  }

  const section = mapReleaseValidationStep(issue.field);
  if (section === "tracks") return "tracks";
  if (section === "stores") return "stores";
  if (section === "release_info") return "info";
  return null;
}

function groupIssuesByStep(
  issues: ReleaseValidationIssue[]
): Record<WizardValidatedStep, string[]> {
  const grouped: Record<WizardValidatedStep, string[]> = {
    intro: [],
    info: [],
    persons: [],
    codes: [],
    stores: [],
    tracks: [],
    extras: []
  };

  for (const issue of issues) {
    const stepId = mapIssueToWizardStep(issue);
    if (!stepId) continue;
    if (!grouped[stepId].includes(issue.message)) {
      grouped[stepId].push(issue.message);
    }
  }

  return grouped;
}

function groupMessagesBySection(
  issues: ReleaseValidationIssue[]
): Record<WizardErrorSection, string[]> {
  const grouped: Record<WizardErrorSection, string[]> = {
    release_info: [],
    tracks: [],
    stores: [],
    pricing: []
  };

  for (const issue of issues) {
    const section = mapReleaseValidationStep(issue.field);
    if (!grouped[section].includes(issue.message)) {
      grouped[section].push(issue.message);
    }
  }

  return grouped;
}

function hasDraftContent(data: WizardData): boolean {
  return Boolean(
    data.cover ||
      data.title.trim() ||
      data.subtitle.trim() ||
      data.language.trim() ||
      data.genre.trim() ||
      data.subgenre.trim() ||
      data.type ||
      data.releaseKind ||
      data.upc.trim() ||
      data.partnerCode.trim() ||
      data.preorderDate.trim() ||
      data.startDate.trim() ||
      data.releaseDate.trim() ||
      data.territoryMode !== "all" ||
      data.territoryCountries.length > 0 ||
      data.platformMode !== "all" ||
      data.platforms.length > 0 ||
      data.tracks.length > 0 ||
      data.persons.length > 0 ||
      data.realTimeDelivery ||
      data.yandexPreReleaseDate.trim() ||
      data.moderatorComment.trim() ||
      data.priorityRelease
  );
}

type SubmitPhase = "idle" | "saving" | "uploading" | "submitting";

function inferContentTypeFromName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".flac")) return "audio/flac";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".aac")) return "audio/aac";
  if (normalized.endsWith(".m4a")) return "audio/mp4";
  if (normalized.endsWith(".aif") || normalized.endsWith(".aiff")) return "audio/aiff";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "_")
    .replace(/_+/gu, "_")
    .slice(0, 120) || "file.bin";
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Некорректный формат data URL.");
  }
  const meta = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = /^data:([^;]+);base64$/u.exec(meta);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = window.atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function toAbsoluteStorageUrl(rawUrl: string): string {
  const normalized = rawUrl.trim();
  if (/^https?:\/\//iu.test(normalized)) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return new URL(normalized, window.location.origin).toString();
  }

  return normalized;
}

function buildObjectReadUrlFromKey(key: string): string {
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/uploads/object/${encoded}`;
}

async function uploadBlobToStorage(params: {
  fileName: string;
  contentType: string;
  blob: Blob;
  kind: "audio" | "cover";
  onProgress?: (loaded: number, total: number) => void;
}): Promise<UploadedFileRef> {
  const uploaded = await uploadBrowserBlobToStorage({
    fileName: sanitizeFileName(params.fileName),
    contentType: params.contentType,
    kind: params.kind,
    blob: params.blob,
    onProgress: params.onProgress
  });

  const readUrl = buildObjectReadUrlFromKey(uploaded.key);
  const cleanUrl = toAbsoluteStorageUrl(readUrl);
  console.log("[cover-upload-success]", {
    bucket: uploaded.bucket ?? null,
    key: uploaded.key,
    publicUrl: cleanUrl
  });
  return {
    storageKey: uploaded.key,
    url: cleanUrl,
    fileName: params.fileName,
    contentType: params.contentType,
    sizeBytes: params.blob.size
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export function ReleaseWizard({
  seed,
  submissionMode = "new",
  pageTitle,
  sourceReleaseId,
  currentStatus,
  moderationStarted
}: {
  seed?: Partial<WizardData>;
  submissionMode?: WizardSubmissionMode;
  pageTitle?: string;
  sourceReleaseId?: string;
  currentStatus?: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
}) {
  return (
    <WizardProvider seed={seed} submissionMode={submissionMode}>
      <WizardInner
        pageTitle={pageTitle ?? (submissionMode === "edit" ? "Редактирование релиза" : "Новый релиз")}
        sourceReleaseId={sourceReleaseId}
        currentStatus={currentStatus}
        moderationStarted={moderationStarted}
      />
    </WizardProvider>
  );
}

function WizardInner({
  pageTitle,
  sourceReleaseId,
  currentStatus,
  moderationStarted
}: {
  pageTitle: string;
  sourceReleaseId?: string;
  currentStatus?: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { step, setStep, set, data, submissionMode } = useWizard();
  const idx = STEPS.findIndex((s) => s.id === step);
  const [submitErrors, setSubmitErrors] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitPhase, setSubmitPhase] = React.useState<SubmitPhase>("idle");
  const [, setDraftReleaseId] = React.useState<string | undefined>(
    resolveDraftReleaseId(submissionMode, sourceReleaseId)
  );
  const draftReleaseIdRef = React.useRef<string | undefined>(
    resolveDraftReleaseId(submissionMode, sourceReleaseId)
  );
  const autosaveTimerRef = React.useRef<number | null>(null);
  const submittingRef = React.useRef(false);
  const draftSavePromiseRef = React.useRef<Promise<ReleaseDraftSaveResponse> | null>(null);
  const queuedDraftSaveRef = React.useRef<{
    method: "POST" | "PATCH";
    payload: ReleaseDraftSaveRequest;
  } | null>(null);
  const [draftStatus, setDraftStatus] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hasSubmittedToModeration, setHasSubmittedToModeration] = React.useState(false);
  const [guardOpen, setGuardOpen] = React.useState(false);
  const [guardError, setGuardError] = React.useState<string | null>(null);
  const [guardSaving, setGuardSaving] = React.useState(false);
  const [stepNavError, setStepNavError] = React.useState<string | null>(null);
  const [contractModalOpen, setContractModalOpen] = React.useState(false);
  const [contractGateStatus, setContractGateStatus] = React.useState<ContractStatusPayload | null>(null);
  const [warningVisible, setWarningVisible] = React.useState(true);
  const [validationToast, setValidationToast] = React.useState<string | null>(null);
  const wizardRootRef = React.useRef<HTMLDivElement | null>(null);
  const [lastSubmitResult, setLastSubmitResult] = React.useState<ReleaseSubmitSuccessResponse | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [submitErrorsBySection, setSubmitErrorsBySection] = React.useState<
    Record<WizardErrorSection, string[]>
  >({
    release_info: [],
    tracks: [],
    stores: [],
    pricing: []
  });
  const [pendingNavigation, setPendingNavigation] = React.useState<
    { type: "href"; href: string } | { type: "back" } | null
  >(null);
  const saveSeqRef = React.useRef(0);
  const initialSnapshotRef = React.useRef<string>("");
  const initializedSnapshotRef = React.useRef(false);

  const updateDraftReleaseId = React.useCallback((nextReleaseId?: string) => {
    draftReleaseIdRef.current = nextReleaseId;
    setDraftReleaseId(nextReleaseId);
  }, []);

  const submissionData = React.useMemo(
    () => buildReleaseSubmissionData(data),
    [data]
  );
  const validationIssues = React.useMemo(
    () => validateReleaseSubmission(submissionData),
    [submissionData]
  );
  const validationMessages = React.useMemo(
    () => {
      const messages = [...new Set(validationIssues.map((issue) => issue.message))];
      const hasAuthorsIssue = validationIssues.some(
        (issue) =>
          issue.field.includes(".trackPersons") &&
          /автора музыки|автора слов/iu.test(issue.message)
      );
      if (hasAuthorsIssue) {
        return [
          "Добавьте автора музыки и автора слов для всех треков",
          ...messages
        ];
      }
      return messages;
    },
    [validationIssues]
  );
  const stepIssues = React.useMemo(
    () => groupIssuesByStep(validationIssues),
    [validationIssues]
  );
  const issuesByStep = React.useMemo(() => {
    const grouped: Partial<Record<WizardValidatedStep, ReleaseValidationIssue[]>> = {};

    for (const issue of validationIssues) {
      const stepId = mapIssueToWizardStep(issue);
      if (!stepId) continue;
      if (!grouped[stepId]) grouped[stepId] = [];
      grouped[stepId]!.push(issue);
    }

    return grouped;
  }, [validationIssues]);
  const stepIssuesWithSubmit = React.useMemo(() => {
    const grouped: Record<WizardValidatedStep, string[]> = {
      intro: [...stepIssues.intro],
      info: [...stepIssues.info],
      persons: [...stepIssues.persons],
      codes: [...stepIssues.codes],
      stores: [...stepIssues.stores],
      tracks: [...stepIssues.tracks],
      extras: [...stepIssues.extras]
    };

    const pushUnique = (stepId: WizardValidatedStep, message: string) => {
      if (!message.trim()) return;
      if (!grouped[stepId].includes(message)) {
        grouped[stepId].push(message);
      }
    };

    for (const message of submitErrorsBySection.release_info) {
      pushUnique("info", message);
    }
    for (const message of submitErrorsBySection.tracks) {
      pushUnique("tracks", message);
    }
    for (const message of submitErrorsBySection.stores) {
      pushUnique("stores", message);
    }
    for (const message of submitErrorsBySection.pricing) {
      pushUnique("extras", message);
    }

    return grouped;
  }, [stepIssues, submitErrorsBySection]);
  const submissionDataSnapshot = React.useMemo(
    () => JSON.stringify(submissionData),
    [submissionData]
  );

  const getCurrentStepValidation = React.useCallback((): StepValidationState | null => {
    if (!VALIDATED_STEPS.includes(step as WizardValidatedStep)) return null;

    const currentStep = step as WizardValidatedStep;
    if (currentStep === "intro") {
      if (data.type) return null;
      return {
        step: currentStep,
        issues: [],
        message: "Выберите один формат релиза: Single, EP или Album.",
        anchorId: null
      };
    }

    const issues = issuesByStep[currentStep] ?? [];
    const fallbackMessages = stepIssues[currentStep] ?? [];

    if (issues.length === 0 && fallbackMessages.length === 0) return null;

    const messages =
      issues.length > 0
        ? Array.from(new Set(issues.map(resolveValidationMessage)))
        : fallbackMessages;

    return {
      step: currentStep,
      issues,
      message: `Заполните обязательные поля: ${formatValidationList(messages)}.`,
      anchorId: issues[0] ? resolveValidationAnchor(issues[0]) : null
    };
  }, [data.type, issuesByStep, step, stepIssues]);

  const getStepLabel = React.useCallback((stepId: WizardValidatedStep) => {
    return STEPS.find((stepMeta) => stepMeta.id === stepId)?.label ?? stepId;
  }, []);

  const scrollToAnchor = React.useCallback((anchorId: WizardAnchorId | null) => {
    if (!anchorId || typeof document === "undefined") return;

    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-wizard-anchor="${anchorId}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const announceValidationFailure = React.useCallback((params: StepValidationState) => {
    setStepNavError(params.message);
    setValidationToast(params.message);
    scrollToAnchor(params.anchorId);
  }, [scrollToAnchor]);

  const isStepIndexEnabled = React.useCallback(
    (targetIndex: number): boolean => {
      if (targetIndex < 0 || targetIndex >= STEPS.length) return false;
      const targetId = STEPS[targetIndex]?.id;
      if (!targetId) return false;
      if (step === "upload") {
        return targetId === "upload";
      }
      if (targetIndex <= idx) return true;
      const currentValidation = getCurrentStepValidation();
      if (currentValidation) return false;
      return targetIndex === idx + 1;
    },
    [getCurrentStepValidation, idx, step]
  );

  const goToStepIndex = React.useCallback(
    (targetIndex: number) => {
      const target = STEPS[targetIndex];
      if (!target) return;

      if (targetIndex <= idx || isStepIndexEnabled(targetIndex)) {
        setStepNavError(null);
        setStep(target.id);
        return;
      }

      const currentValidation = getCurrentStepValidation();
      if (currentValidation) {
        announceValidationFailure(currentValidation);
        return;
      }

      setStepNavError("Невозможно перейти на этот шаг, пока не заполнены обязательные поля.");
    },
    [announceValidationFailure, getCurrentStepValidation, idx, isStepIndexEnabled, setStep]
  );

  React.useEffect(() => {
    if (initializedSnapshotRef.current) {
      return;
    }
    initialSnapshotRef.current = submissionDataSnapshot;
    initializedSnapshotRef.current = true;
  }, [submissionDataSnapshot]);

  React.useEffect(() => {
    updateDraftReleaseId(resolveDraftReleaseId(submissionMode, sourceReleaseId));
    setLastSubmitResult(null);
  }, [sourceReleaseId, submissionMode, updateDraftReleaseId]);

  React.useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const shouldGuard =
    initializedSnapshotRef.current &&
    shouldGuardUnsavedChanges({
      initialSnapshot: initialSnapshotRef.current,
      currentSnapshot: submissionDataSnapshot,
      hasSubmittedToModeration
    });

  const goNext = () => {
    const currentValidation = getCurrentStepValidation();
    if (currentValidation) {
      announceValidationFailure(currentValidation);
      return;
    }

    const nextIndex = idx + 1;
    if (nextIndex < STEPS.length) {
      goToStepIndex(nextIndex);
    }
  };
  React.useEffect(() => {
    if (!validationToast) return;
    const timeout = window.setTimeout(() => setValidationToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [validationToast]);

  const goPrev = () => {
    if (idx > 0) {
      setStepNavError(null);
      setStep(STEPS[idx - 1].id);
    }
  };

  const saveDraftToBackend = React.useCallback(
    async (method: "POST" | "PATCH", payload: ReleaseDraftSaveRequest) => {
      const response = await fetch("/api/releases/draft", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as
          | { error?: string; message?: string; errors?: Array<{ message?: string }> }
          | null;
        const message =
          parsed?.errors?.[0]?.message ??
          parsed?.message ??
          parsed?.error ??
          "Не удалось сохранить черновик.";
        throw new Error(message);
      }
      const parsed = (await response.json()) as ReleaseDraftSaveResponse;
      return parsed;
    },
    []
  );

  const persistDraft = React.useCallback(
    async (params: {
      method: "POST" | "PATCH";
      payload: ReleaseDraftSaveRequest;
    }): Promise<ReleaseDraftSaveResponse> => {
      queuedDraftSaveRef.current = params;
      if (draftSavePromiseRef.current) {
        return await draftSavePromiseRef.current;
      }

      const request = (async () => {
        let lastResult: ReleaseDraftSaveResponse | null = null;

        while (queuedDraftSaveRef.current) {
          const next = queuedDraftSaveRef.current;
          queuedDraftSaveRef.current = null;

          const resolvedReleaseId =
            next.payload.releaseId ??
            (submissionMode === "new" ? draftReleaseIdRef.current : sourceReleaseId);
          const resolvedMethod = resolvedReleaseId ? "PATCH" : next.method;
          const resolvedPayload: ReleaseDraftSaveRequest = {
            ...next.payload,
            releaseId: resolvedReleaseId
          };

          const parsed = await saveDraftToBackend(resolvedMethod, resolvedPayload);
          if (parsed.releaseId) {
            updateDraftReleaseId(parsed.releaseId);
          }
          lastResult = parsed;
        }

        if (!lastResult) {
          throw new Error("Не удалось сохранить черновик.");
        }

        return lastResult;
      })();

      draftSavePromiseRef.current = request;
      try {
        return await request;
      } finally {
        if (draftSavePromiseRef.current === request) {
          draftSavePromiseRef.current = null;
        }
      }
    },
    [saveDraftToBackend, sourceReleaseId, submissionMode, updateDraftReleaseId]
  );

  const prepareSubmissionDataWithUploads = React.useCallback(async (): Promise<ReleaseSubmissionData> => {
    const preparedTracks = submissionData.tracks.map((track) => ({ ...track }));
    const prepared: ReleaseSubmissionData = {
      ...submissionData,
      tracks: preparedTracks
    };
    let updatedTracks = data.tracks;
    let tracksChanged = false;
    const uploadState = new Map<string, number>();
    const uploadJobs: Array<{ id: string; size: number }> = [];

    if (prepared.cover && prepared.cover.startsWith("data:") && !prepared.coverUpload) {
      const coverBlob = dataUrlToBlob(prepared.cover);
      uploadJobs.push({ id: "cover", size: Math.max(coverBlob.size, 1) });
    }

    for (let index = 0; index < preparedTracks.length; index += 1) {
      const track = preparedTracks[index];
      const trackState = data.tracks[index];
      if (!trackState || track.hasAudio === false) continue;
      if (track.audioFile?.storageKey && track.audioFile?.url) continue;
      if (trackState.audioUpload?.storageKey && trackState.audioUpload?.url) continue;
      const size = trackState.localAudioFile?.size ?? trackState.size ?? 0;
      uploadJobs.push({ id: `track:${trackState.id}`, size: Math.max(size, 1) });
    }

    const totalUploadBytes = uploadJobs.reduce((sum, job) => sum + job.size, 0);
    const updateUploadProgress = (id: string, loaded: number, total: number) => {
      if (totalUploadBytes <= 0) return;
      const normalizedLoaded = Math.max(0, Math.min(total || 1, loaded));
      uploadState.set(id, normalizedLoaded);
      const loadedBytes = uploadJobs.reduce(
        (sum, job) => sum + Math.min(job.size, uploadState.get(job.id) ?? 0),
        0
      );
      const next = Math.max(2, Math.min(96, Math.round((loadedBytes / totalUploadBytes) * 100)));
      setUploadProgress(next);
    };

    if (prepared.cover && prepared.cover.startsWith("data:") && !prepared.coverUpload) {
      try {
        const coverBlob = dataUrlToBlob(prepared.cover);
        const contentType = coverBlob.type || data.coverMeta?.mimeType || "image/jpeg";
        const fileExtension =
          contentType === "image/png" ? "png" : "jpg";
        const upload = await uploadBlobToStorage({
          fileName: `release-cover.${fileExtension}`,
          contentType,
          blob: coverBlob,
          kind: "cover",
          onProgress: (loaded, total) => updateUploadProgress("cover", loaded, total)
        });
        const coverUpload: UploadedCoverRef = {
          ...upload,
          width: data.coverMeta?.width,
          height: data.coverMeta?.height
        };
        prepared.cover = upload.url;
        prepared.coverUpload = coverUpload;
        set("cover", upload.url);
        set("coverUpload", coverUpload);
      } catch (error) {
        const reason =
          error instanceof Error && error.message
            ? ` Причина: ${error.message}`
            : "";
        throw new Error(
          `Не удалось загрузить обложку. Перезагрузите файл обложки и повторите отправку.${reason}`
        );
      }
    }

    const uploadResults = await mapWithConcurrency(preparedTracks, 3, async (track, index) => {
      const trackState = data.tracks[index];
      if (!trackState || track.hasAudio === false) {
        return { index, upload: null as UploadedFileRef | null };
      }

      if (track.audioFile?.storageKey && track.audioFile?.url) {
        return { index, upload: track.audioFile };
      }

      if (trackState.audioUpload?.storageKey && trackState.audioUpload?.url) {
        return { index, upload: trackState.audioUpload };
      }

      if (!trackState.localAudioFile && !trackState.audioUrl) {
        throw new Error(`Трек «${trackState.name}» не содержит аудиофайл для загрузки.`);
      }

      let audioBlob: Blob;
      if (trackState.localAudioFile) {
        audioBlob = trackState.localAudioFile;
      } else {
        try {
          const audioResponse = await fetch(trackState.audioUrl as string);
          if (!audioResponse.ok) {
            throw new Error("audio_unavailable");
          }
          audioBlob = await audioResponse.blob();
        } catch {
          throw new Error(
            `Не удалось получить локальный аудиофайл трека «${trackState.name}». Заново прикрепите файл на шаге «Список треков» и повторите отправку. На iPhone и во встроенных webview надёжнее повторить загрузку в Safari или Chrome.`
          );
        }
      }

      const contentType = audioBlob.type || inferContentTypeFromName(trackState.name);
      try {
        const upload = await uploadBlobToStorage({
          fileName: trackState.name,
          contentType,
          blob: audioBlob,
          kind: "audio",
          onProgress: (loaded, total) => updateUploadProgress(`track:${trackState.id}`, loaded, total)
        });
        return { index, upload };
      } catch (error) {
        const reason =
          error instanceof Error && error.message
            ? ` Причина: ${error.message}`
            : "";
        throw new Error(
          `Не удалось загрузить аудиофайл трека «${trackState.name}» в хранилище. Проверьте подключение и повторите.${reason}`
        );
      }
    });

    for (const result of uploadResults) {
      if (!result.upload) continue;
      const track = preparedTracks[result.index];
      const trackState = data.tracks[result.index];
      if (!track || !trackState) continue;
      track.audioFile = result.upload;

      if (
        trackState.audioUpload?.storageKey === result.upload.storageKey &&
        trackState.audioUpload?.url === result.upload.url &&
        !trackState.localAudioFile
      ) {
        continue;
      }

      tracksChanged = true;
      updatedTracks = updatedTracks.map((item, itemIndex) =>
        itemIndex === result.index
          ? {
              ...item,
              localAudioFile: null,
              audioUpload: result.upload
            }
          : item
      );
    }

    if (tracksChanged) {
      set("tracks", updatedTracks);
    }

    if (totalUploadBytes > 0) {
      setUploadProgress(96);
    }

    return prepared;
  }, [data, set, submissionData]);

  const doSubmit = React.useCallback(async () => {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const localIssues = validateReleaseSubmission(submissionData);

    if (localIssues.length > 0) {
      setSubmitErrors([...new Set(localIssues.map((issue) => issue.message))]);
      setSubmitErrorsBySection(groupMessagesBySection(localIssues));
      return;
    }

    setSubmitting(true);
    setUploadProgress(2);
    setSubmitPhase("uploading");
    setStep("upload");
    setSubmitErrors([]);
    setSubmitErrorsBySection({
      release_info: [],
      tracks: [],
      stores: [],
      pricing: []
    });

    try {
      const pendingSubmission = readPendingSubmission(
        window.localStorage,
        submissionMode === "new" ? draftReleaseIdRef.current : sourceReleaseId,
        submissionDataSnapshot
      );
      const preparedSubmissionData = pendingSubmission?.payload.data ?? await prepareSubmissionDataWithUploads();
      setUploadProgress((current) => Math.max(current, 97));
      setSubmitPhase("saving");
      const draftPayload: ReleaseDraftSaveRequest = {
        releaseId:
          submissionMode === "new" ? draftReleaseIdRef.current : sourceReleaseId,
        data: preparedSubmissionData
      };

      if (submissionMode === "edit" && !draftPayload.releaseId) {
        setSubmitErrors([
          "Не найден идентификатор релиза для отправки на модерацию."
        ]);
        return;
      }

      const draftMethod =
        submissionMode === "new" && !draftReleaseIdRef.current ? "POST" : "PATCH";
      let savedDraft = pendingSubmission?.draft;
      const draftResult = await submitReleaseWithLatestDraft({
        savedDraft,
        saveLatestDraft: async () => {
          savedDraft = await persistDraft({ method: draftMethod, payload: draftPayload });
          return savedDraft;
        },
        submitForModeration: async (releaseId: string) => {
          setSubmitPhase("submitting");

          const payload: ReleaseSubmitRequest = pendingSubmission?.payload ?? {
            mode: resolveReleaseSubmitMode(submissionMode, currentStatus),
            releaseId,
            currentStatus,
            moderationStarted,
            data: preparedSubmissionData
          };

          const idempotencyKey = pendingSubmission?.key ?? crypto.randomUUID();
          savePendingSubmission(window.localStorage, {
            key: idempotencyKey, snapshot: submissionDataSnapshot,
            draft: savedDraft!, payload
          });
          const response = await fetch("/api/releases/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const parsed = (await response.json().catch(() => null)) as
              | ReleaseSubmitFailureResponse
              | { error?: string; message?: string }
              | null;
            if (parsed && "errors" in parsed && Array.isArray(parsed.errors)) {
              setSubmitErrors([...new Set(parsed.errors.map((issue) => issue.message))]);
              if ("errors_by_step" in parsed && parsed.errors_by_step) {
                setSubmitErrorsBySection({
                  release_info: (parsed.errors_by_step.release_info ?? []).map((issue) => issue.message),
                  tracks: (parsed.errors_by_step.tracks ?? []).map((issue) => issue.message),
                  stores: (parsed.errors_by_step.stores ?? []).map((issue) => issue.message),
                  pricing: (parsed.errors_by_step.pricing ?? []).map((issue) => issue.message)
                });
              } else {
                setSubmitErrorsBySection(groupMessagesBySection(parsed.errors));
              }
            } else {
              const fallbackMessage =
                parsed && "message" in parsed && typeof parsed.message === "string"
                  ? parsed.message
                  : parsed && "error" in parsed
                    ? parsed.error
                    : undefined;
              setSubmitErrors([
                fallbackMessage ??
                  "Не удалось отправить релиз на модерацию. Попробуйте позже."
              ]);
              setSubmitErrorsBySection({
                release_info: [],
                tracks: [],
                stores: [],
                pricing: []
              });
            }
            throw new Error("submit_failed");
          }

          const parsed = (await response.json().catch(() => null)) as
            | ReleaseSubmitSuccessResponse
            | null;
          if (!parsed?.ok) throw new Error("Не удалось подтвердить отправку релиза. Повторите попытку.");
          if (parsed.ok) {
            completePendingSubmission(window.localStorage, releaseId);
            setLastSubmitResult(parsed);
            setUploadProgress(100);
          }
        }
      });
      window.dispatchEvent(
        new CustomEvent("dashboard:drafts-count", {
          detail: { draftsCount: draftResult.draftsCount }
        })
      );
      window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
      setDraftStatus("saved");
      initialSnapshotRef.current = submissionDataSnapshot;

      setHasSubmittedToModeration(true);
      initialSnapshotRef.current = submissionDataSnapshot;
      setDraftStatus("idle");

      try {
        const draftCountResponse = await fetch("/api/releases/draft/count", {
          method: "GET"
        });
        if (draftCountResponse.ok) {
          const draftCountPayload = (await draftCountResponse.json()) as {
            draftsCount?: number;
          };
          if (typeof draftCountPayload.draftsCount === "number") {
            window.dispatchEvent(
              new CustomEvent("dashboard:drafts-count", {
                detail: { draftsCount: draftCountPayload.draftsCount }
              })
            );
            window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
          }
        }
      } catch {
        // optional refresh for sidebar counters; ignore failure
      }

    } catch (error) {
      setStep("review");
      if (error instanceof Error && error.message === "submit_failed") {
        return;
      }
      const normalizedMessage =
        error instanceof Error && error.message === "Failed to fetch"
          ? "Ошибка сети при загрузке файлов. Перезагрузите аудио/обложку и повторите отправку."
          : error instanceof Error && error.message
            ? error.message
            : "Не удалось сохранить изменения или отправить релиз на модерацию. Попробуйте позже.";
      const lower = normalizedMessage.toLowerCase();
      const tracksRelated =
        lower.includes("аудиофайл трека") ||
        lower.includes("шаге «список треков»") ||
        lower.includes("загрузке файлов");
      const coverRelated =
        lower.includes("обложк");
      setSubmitErrors([
        normalizedMessage
      ]);
      setSubmitErrorsBySection({
        release_info: coverRelated ? [normalizedMessage] : [],
        tracks: tracksRelated ? [normalizedMessage] : [],
        stores: [],
        pricing: []
      });
    } finally {
      setSubmitting(false);
      setSubmitPhase("idle");
    }
  }, [
    currentStatus,
    moderationStarted,
    prepareSubmissionDataWithUploads,
    persistDraft,
    setStep,
    submissionDataSnapshot,
    sourceReleaseId,
    submissionMode
  ]);

  const handleSubmit = React.useCallback(async () => {
    if (submittingRef.current) return;
    setStepNavError(null);

    try {
      const response = await fetch("/api/verification/contract/status", {
        method: "GET",
        cache: "no-store"
      });
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | ContractStatusPayload
          | null;
        if (!payload?.canCreateRelease) {
          setContractGateStatus(payload);
          setContractModalOpen(true);
          return;
        }
      }
    } catch {
      // optional: backend enforcement will still block submit if required
    }

    await doSubmit();
  }, [doSubmit]);

  const jumpToErrorSection = React.useCallback(
    (section: WizardErrorSection) => {
      if (section === "tracks") {
        setStep("tracks");
        return;
      }
      if (section === "stores") {
        setStep("stores");
        return;
      }
      if (section === "pricing") {
        setStep("review");
        return;
      }
      setStep("info");
    },
    [setStep]
  );

  const saveDraft = React.useCallback(
    async (manual: boolean): Promise<boolean> => {
      const allowAutosave = true;
      if (!manual && !allowAutosave) {
        return false;
      }
      if (step === "upload") {
        return false;
      }
      if (!manual && !hasDraftContent(data)) {
        return false;
      }

      const preparedSubmissionData = await prepareSubmissionDataWithUploads();

      const payload: ReleaseDraftSaveRequest = {
        releaseId:
          submissionMode === "new"
            ? draftReleaseIdRef.current
            : sourceReleaseId,
        data: preparedSubmissionData
      };

      if (submissionMode === "edit" && !payload.releaseId) {
        throw new Error("Не найден идентификатор релиза для сохранения черновика.");
      }

      const method =
        submissionMode === "new" && !draftReleaseIdRef.current ? "POST" : "PATCH";

      const parsed = await persistDraft({ method, payload });
      window.dispatchEvent(
        new CustomEvent("dashboard:drafts-count", {
          detail: { draftsCount: parsed.draftsCount }
        })
      );
      window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
      setDraftStatus("saved");
      initialSnapshotRef.current = JSON.stringify(preparedSubmissionData);
      return true;
    },
    [
      data,
      prepareSubmissionDataWithUploads,
      persistDraft,
      sourceReleaseId,
      step,
      submissionMode
    ]
  );

  React.useEffect(() => {
    if (step === "upload") {
      return;
    }
    if (submitting) {
      return;
    }
    if (!hasDraftContent(data)) {
      return;
    }

    const seq = ++saveSeqRef.current;
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (submittingRef.current) {
        return;
      }
      setDraftStatus("saving");

      void saveDraft(false)
        .then(() => {
          if (saveSeqRef.current !== seq) return;
        })
        .catch(() => {
          if (saveSeqRef.current !== seq) return;
          setDraftStatus("error");
        });
    }, 900);

    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [data, saveDraft, step, submissionMode, submitting]);

  const proceedPendingNavigation = React.useCallback(() => {
    if (!pendingNavigation) return;
    const current = pendingNavigation;
    setPendingNavigation(null);
    if (current.type === "href") {
      router.push(current.href);
      return;
    }
    window.history.back();
  }, [pendingNavigation, router]);

  React.useEffect(() => {
    if (!shouldGuard) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!wizardRootRef.current?.contains(target)) return;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (
        anchor.dataset.bypassWizardGuard === "true" ||
        anchor.closest("[data-dashboard-sidebar='true']")
      ) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (href === pathname) return;
      if (/^https?:\/\//u.test(href)) return;

      event.preventDefault();
      setGuardError(null);
      setPendingNavigation({ type: "href", href });
      setGuardOpen(true);
    };

    const onPopState = () => {
      window.history.pushState({ wizardGuard: true }, "", window.location.href);
      setGuardError(null);
      setPendingNavigation({ type: "back" });
      setGuardOpen(true);
    };

    window.history.pushState({ wizardGuard: true }, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [pathname, shouldGuard]);

  const onGuardKeepEditing = () => {
    setGuardError(null);
    setGuardOpen(false);
    setPendingNavigation(null);
  };

  const onGuardDiscard = () => {
    setGuardError(null);
    setGuardOpen(false);
    proceedPendingNavigation();
  };

  const onGuardSave = async () => {
    setGuardSaving(true);
    setGuardError(null);
    try {
      const saved = await saveDraft(true);
      if (!saved) {
        setGuardError("Нет изменений для сохранения в черновик.");
        return;
      }
      setGuardOpen(false);
      proceedPendingNavigation();
    } catch (saveError) {
      setGuardError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить черновик перед выходом."
      );
    } finally {
      setGuardSaving(false);
    }
  };

  const currentChrome = STEP_CHROME[step];

  return (
    <div ref={wizardRootRef} className="pb-16 pt-2">
      <div className="mx-auto w-full max-w-[960px] space-y-6">
        <div className="mx-auto flex w-full max-w-[860px] flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-[#f6f2ea] sm:text-[30px]">{pageTitle}</h1>
              {submissionMode === "new" ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    draftStatus === "saving" && "border-[var(--ux-accent)]/35 bg-[var(--ux-accent)]/10 text-[#cfc4ff]",
                    draftStatus === "saved" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                    draftStatus === "error" && "border-rose-400/30 bg-rose-400/10 text-rose-200",
                    draftStatus === "idle" && "border-[var(--ux-accent)]/35 bg-[var(--ux-accent)]/14 text-[#d8c9ff]"
                  )}
                >
                  {draftStatus === "saving" && "Черновик сохраняется"}
                  {draftStatus === "saved" && "Черновик сохранён"}
                  {draftStatus === "error" && "Ошибка сохранения"}
                  {draftStatus === "idle" && "Рабочий черновик"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[860px] space-y-5">
          <ReleaseWizardTimeline step={step} />

          {warningVisible ? (
            <div className="relative rounded-[26px] border border-[#4d2d26] bg-[linear-gradient(180deg,rgba(88,37,29,0.34),rgba(22,19,18,0.96))] px-5 py-4 text-[#efe6dc] shadow-[0_20px_46px_-32px_rgba(0,0,0,0.95)] sm:px-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#6f2f25]/55 text-[#ffb59a]">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold">Внимание</p>
                  <p className="mt-1 max-w-3xl text-[13px] leading-6 text-[#cfb8a6]">
                    По закону РФ запрещена дистрибуция треков с наркотематикой. Принимается только clean-версия без упоминаний запрещённых веществ.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWarningVisible(false)}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl text-[#8f7166] transition-colors hover:bg-white/[0.04] hover:text-[#f4e7d8]"
                aria-label="Закрыть предупреждение"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9beff]">{currentChrome.section}</p>
            <h2 className="text-[38px] font-black tracking-[-0.055em] text-[#faf6ef] sm:text-[56px]">{currentChrome.title}</h2>
            <p className="max-w-2xl text-[14px] leading-6 text-[var(--ux-text-secondary)]">{currentChrome.description}</p>
          </div>

          {stepNavError ? (
            <div className="rounded-[20px] border border-rose-400/45 bg-[linear-gradient(180deg,rgba(127,29,29,0.22),rgba(32,18,20,0.92))] px-4 py-3.5 text-[13.5px] text-rose-100 shadow-[0_18px_46px_-30px_rgba(251,113,133,0.65)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <p>{stepNavError}</p>
              </div>
            </div>
          ) : null}

          {validationToast ? (
            <div className="pointer-events-none fixed bottom-6 right-6 z-[70] max-w-[420px] rounded-[18px] border border-rose-400/45 bg-[linear-gradient(180deg,rgba(127,29,29,0.3),rgba(32,18,20,0.96))] px-4 py-3 text-[13.5px] text-rose-50 shadow-[0_24px_60px_-28px_rgba(251,113,133,0.55)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <p>{validationToast}</p>
              </div>
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[860px]"
            >
              {step === "intro" ? <StepIntro /> : null}
              {step === "info" ? <StepInfo section="basics" /> : null}
              {step === "persons" ? <StepInfo section="persons" /> : null}
              {step === "codes" ? <StepInfo section="codes" /> : null}
              {step === "stores" ? <StepInfo section="stores" /> : null}
              {step === "tracks" ? <StepTracks /> : null}
              {step === "extras" ? <StepExtras /> : null}
              {step === "review" ? (
                <StepReview
                  onSubmit={handleSubmit}
                  errors={submitErrors}
                  errorsBySection={submitErrorsBySection}
                  onJumpToSection={jumpToErrorSection}
                  blockingErrors={validationMessages}
                  stepIssues={stepIssuesWithSubmit}
                  isSubmitting={submitting}
                  submitPhase={submitPhase}
                />
              ) : null}
              {step === "upload" ? (
                <StepUpload
                  submitResult={lastSubmitResult}
                  progress={uploadProgress}
                  submitPhase={submitPhase}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

      <VerificationAccessModal
        open={contractModalOpen}
        status={
          contractGateStatus ?? {
          status: "not_signed",
          signed: false,
          isVerified: false,
          canSubmitReleases: false,
          canCreateRelease: false,
          signedAt: null,
          contractVersion: null,
          reason: "Для выпуска релизов необходимо пройти верификацию и подписать договор.",
          rejectionReason: null,
          rejectionKind: null,
          verificationId: null
        }
        }
        onClose={() => {
          setContractModalOpen(false);
          setStepNavError("Для выпуска релизов необходимо пройти верификацию и подписать договор.");
        }}
      />

      {/* nav buttons (hidden on review/upload — review has its own CTA) */}
      {step !== "review" && step !== "upload" ? (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            disabled={idx === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[12.5px] text-white/75 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white",
              idx === 0 && "cursor-not-allowed opacity-40 hover:bg-white/[0.02]"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Назад
          </button>

          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-[14px] bg-[var(--ux-accent)] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[var(--ux-accent-strong)]"
          >
            Далее
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

        {guardOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.16] bg-[#12141c] p-5 shadow-2xl">
            <h3 className="text-[20px] font-semibold text-white">
              Сохранить изменения в черновик?
            </h3>
            <p className="mt-2 text-[15px] font-medium text-white/70">
              У вас есть несохранённые изменения. Выберите действие перед выходом.
            </p>
            {guardError ? (
              <p className="mt-3 text-[14px] font-medium text-rose-300">{guardError}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onGuardKeepEditing}
                className="rounded-xl border border-white/[0.14] px-3.5 py-2 text-[14px] font-medium text-white/82 transition-colors hover:bg-white/[0.06]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onGuardDiscard}
                className="rounded-xl border border-rose-400/30 px-3.5 py-2 text-[14px] font-medium text-rose-200 transition-colors hover:bg-rose-400/10"
              >
                Не сохранять
              </button>
              <button
                type="button"
                onClick={() => {
                  void onGuardSave();
                }}
                disabled={guardSaving}
                className="rounded-xl bg-[#7b3df5] px-3.5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#8b4ff7] disabled:opacity-60"
              >
                {guardSaving ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
