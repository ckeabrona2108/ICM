"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
import { submitReleaseWithLatestDraft } from "@/lib/release-submit-flow";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { VerificationAccessModal } from "@/components/verification/verification-access-modal";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "info", label: "Информация по релизу" },
  { id: "tracks", label: "Список треков" },
  { id: "extras", label: "Дополнительные параметры" },
  { id: "review", label: "Проверка" },
  { id: "upload", label: "Загрузка" }
];

type WizardValidatedStep = "info" | "tracks" | "extras";
type WizardErrorSection = "release_info" | "tracks" | "stores" | "pricing";

const VALIDATED_STEPS: WizardValidatedStep[] = ["info", "tracks", "extras"];

function mapIssueToWizardStep(issue: ReleaseValidationIssue): WizardValidatedStep | null {
  if (issue.field === "yandexPreReleaseDate") return "extras";
  if (issue.field === "releaseKind" && issue.code === "invalid") {
    return "tracks";
  }

  const section = mapReleaseValidationStep(issue.field);
  if (section === "tracks") return "tracks";
  if (section === "stores") return "extras";
  if (section === "release_info") return "info";
  return null;
}

function groupIssuesByStep(
  issues: ReleaseValidationIssue[]
): Record<WizardValidatedStep, string[]> {
  const grouped: Record<WizardValidatedStep, string[]> = {
    info: [],
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

interface PresignedUploadResponse {
  key: string;
  url: string;
  method?: string;
  fields?: Record<string, string>;
  mock?: boolean;
}

function inferContentTypeFromName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".flac")) return "audio/flac";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
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

async function uploadBlobToStorage(params: {
  fileName: string;
  contentType: string;
  blob: Blob;
}): Promise<UploadedFileRef> {
  const targetResponse = await fetch("/api/uploads/presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: sanitizeFileName(params.fileName),
      contentType: params.contentType
    })
  });

  const target = (await targetResponse.json().catch(() => null)) as
    | PresignedUploadResponse
    | { error?: string }
    | null;

  if (!targetResponse.ok || !target || !("url" in target) || !target.url || !target.key) {
    const fallback =
      target && "error" in target && typeof target.error === "string"
        ? target.error
        : "Не удалось получить ссылку для загрузки.";
    throw new Error(fallback);
  }

  if (target.mock) {
    throw new Error("Хранилище файлов не настроено. Проверьте S3 параметры окружения.");
  }

  const uploadResponse = await fetch(target.url, {
    method: target.method ?? "PUT",
    headers: {
      "Content-Type": params.contentType
    },
    body: params.blob
  });

  if (!uploadResponse.ok) {
    throw new Error("Ошибка загрузки файла в хранилище.");
  }

  const cleanUrl = toAbsoluteStorageUrl(target.url.split("?")[0] ?? target.url);
  return {
    storageKey: target.key,
    url: cleanUrl,
    fileName: params.fileName,
    contentType: params.contentType,
    sizeBytes: params.blob.size
  };
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
  const wizardRootRef = React.useRef<HTMLDivElement | null>(null);
  const [lastSubmitResult, setLastSubmitResult] = React.useState<ReleaseSubmitSuccessResponse | null>(null);
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
  const stepIssuesWithSubmit = React.useMemo(() => {
    const grouped: Record<WizardValidatedStep, string[]> = {
      info: [...stepIssues.info],
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
      pushUnique("extras", message);
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

  const getCurrentStepValidation = React.useCallback(() => {
    if (!VALIDATED_STEPS.includes(step as WizardValidatedStep)) return null;
    const currentStep = step as WizardValidatedStep;
    const messages = stepIssues[currentStep];
    if (messages.length === 0) return null;
    return { step: currentStep, message: messages[0] };
  }, [step, stepIssues]);

  const getStepLabel = React.useCallback((stepId: WizardValidatedStep) => {
    return STEPS.find((stepMeta) => stepMeta.id === stepId)?.label ?? stepId;
  }, []);

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
        setStepNavError(
          `Заполните обязательные поля шага «${getStepLabel(currentValidation.step)}». ${currentValidation.message ?? ""}`.trim()
        );
        return;
      }

      setStepNavError("Невозможно перейти на этот шаг, пока не заполнены обязательные поля.");
    },
    [getCurrentStepValidation, getStepLabel, idx, isStepIndexEnabled, setStep]
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
      setStepNavError(
        `Заполните обязательные поля шага «${getStepLabel(currentValidation.step)}». ${currentValidation.message ?? ""}`.trim()
      );
      return;
    }

    const nextIndex = idx + 1;
    if (nextIndex < STEPS.length) {
      goToStepIndex(nextIndex);
    }
  };
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
      if (draftSavePromiseRef.current) {
        return await draftSavePromiseRef.current;
      }

      const resolvedReleaseId =
        params.payload.releaseId ??
        (submissionMode === "new" ? draftReleaseIdRef.current : sourceReleaseId);
      const resolvedMethod = resolvedReleaseId ? "PATCH" : params.method;
      const resolvedPayload: ReleaseDraftSaveRequest = {
        ...params.payload,
        releaseId: resolvedReleaseId
      };

      const request = (async () => {
        const parsed = await saveDraftToBackend(resolvedMethod, resolvedPayload);
        if (parsed.releaseId) {
          updateDraftReleaseId(parsed.releaseId);
        }
        return parsed;
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

    if (prepared.cover && prepared.cover.startsWith("data:") && !prepared.coverUpload) {
      try {
        const coverBlob = dataUrlToBlob(prepared.cover);
        const contentType = coverBlob.type || data.coverMeta?.mimeType || "image/jpeg";
        const fileExtension =
          contentType === "image/png" ? "png" : "jpg";
        const upload = await uploadBlobToStorage({
          fileName: `release-cover.${fileExtension}`,
          contentType,
          blob: coverBlob
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

    for (let index = 0; index < preparedTracks.length; index += 1) {
      const track = preparedTracks[index];
      const trackState = data.tracks[index];
      if (!trackState || track.hasAudio === false) continue;

      if (track.audioFile?.storageKey && track.audioFile?.url) {
        continue;
      }

      if (trackState.audioUpload?.storageKey && trackState.audioUpload?.url) {
        track.audioFile = trackState.audioUpload;
        continue;
      }

      if (!trackState.audioUrl) {
        throw new Error(`Трек «${trackState.name}» не содержит аудиофайл для загрузки.`);
      }

      let audioBlob: Blob;
      try {
        const audioResponse = await fetch(trackState.audioUrl);
        if (!audioResponse.ok) {
          throw new Error("audio_unavailable");
        }
        audioBlob = await audioResponse.blob();
      } catch {
        throw new Error(
          `Не удалось загрузить аудиофайл трека «${trackState.name}». Перезагрузите файл на шаге «Список треков».`
        );
      }
      const contentType = audioBlob.type || inferContentTypeFromName(trackState.name);
      let upload: UploadedFileRef;
      try {
        upload = await uploadBlobToStorage({
          fileName: trackState.name,
          contentType,
          blob: audioBlob
        });
      } catch (error) {
        const reason =
          error instanceof Error && error.message
            ? ` Причина: ${error.message}`
            : "";
        throw new Error(
          `Не удалось загрузить аудиофайл трека «${trackState.name}» в хранилище. Проверьте подключение и повторите.${reason}`
        );
      }
      track.audioFile = upload;
      tracksChanged = true;
      updatedTracks = updatedTracks.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              audioUpload: upload
            }
          : item
      );
    }

    if (tracksChanged) {
      set("tracks", updatedTracks);
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
    setSubmitPhase("uploading");
    setSubmitErrors([]);
    setSubmitErrorsBySection({
      release_info: [],
      tracks: [],
      stores: [],
      pricing: []
    });

    try {
      const preparedSubmissionData = await prepareSubmissionDataWithUploads();
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
      const draftResult = await submitReleaseWithLatestDraft({
        saveLatestDraft: async () =>
          await persistDraft({ method: draftMethod, payload: draftPayload }),
        submitForModeration: async (releaseId: string) => {
          setSubmitPhase("submitting");

          const payload: ReleaseSubmitRequest = {
            mode: resolveReleaseSubmitMode(submissionMode, currentStatus),
            releaseId,
            currentStatus,
            moderationStarted,
            data: preparedSubmissionData
          };

          const response = await fetch("/api/releases/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          if (parsed?.ok) {
            setLastSubmitResult(parsed);
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

      setStep("upload");
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
        setStep("info");
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
      const allowAutosave = submissionMode === "new";
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
    if (submissionMode !== "new") {
      return;
    }
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

  return (
    <div ref={wizardRootRef} className="pb-12">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[30px] font-bold tracking-tight text-white sm:text-[34px]">{pageTitle}</h1>
          {submissionMode === "new" ? (
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] leading-none",
                draftStatus === "saving" &&
                  "border-amber-400/35 bg-amber-400/10 text-amber-200",
                draftStatus === "saved" &&
                  "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
                draftStatus === "error" &&
                  "border-rose-400/35 bg-rose-400/10 text-rose-200",
                draftStatus === "idle" &&
                  "border-white/[0.10] bg-white/[0.04] text-white/65"
              )}
            >
              {draftStatus === "saving" && "Черновик сохраняется..."}
              {draftStatus === "saved" && "Черновик сохранен"}
              {draftStatus === "error" && "Ошибка сохранения черновика"}
              {draftStatus === "idle" && "Черновик: ожидание"}
            </span>
          ) : null}
        </div>
      </div>

      {/* tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#13151d]/85 p-1">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const passed = i < idx;
          const enabled = isStepIndexEnabled(i);
          const validatedStep = VALIDATED_STEPS.includes(s.id as WizardValidatedStep)
            ? (s.id as WizardValidatedStep)
            : null;
          const issuesCount = validatedStep ? stepIssuesWithSubmit[validatedStep].length : 0;
          return (
            <button
              key={s.id}
              type="button"
              aria-disabled={!enabled}
              onClick={() => {
                goToStepIndex(i);
              }}
              className={cn(
                "relative rounded-lg px-3 py-2 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/55",
                active
                  ? "text-white"
                  : passed
                    ? "text-white/70 hover:text-white"
                    : enabled
                      ? "cursor-pointer text-white/55 hover:text-white/90"
                      : "cursor-not-allowed text-white/30"
              )}
            >
              {active ? (
                <motion.span
                  layoutId="wizard-tab"
                  className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              <span className="relative inline-flex items-center gap-2">
                <span>{s.label}</span>
                {validatedStep ? (
                  issuesCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/20 px-1.5 text-[11px] font-semibold text-rose-200">
                      {issuesCount}
                    </span>
                  ) : (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[11px] font-semibold text-emerald-200">
                      ✓
                    </span>
                  )
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {stepNavError ? (
        <p className="mb-5 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200/95">
          {stepNavError}
        </p>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === "info" ? <StepInfo /> : null}
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
          {step === "upload" ? <StepUpload submitResult={lastSubmitResult} /> : null}
        </motion.div>
      </AnimatePresence>

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
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7b3df5] px-4 py-2 text-[12.5px] font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#8b4ff7]"
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
  );
}
