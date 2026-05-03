import { z } from "zod";

const avatarMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export const userProfileNameSchema = z
  .string()
  .trim()
  .min(1, "Имя не может быть пустым.")
  .max(80, "Имя не должно превышать 80 символов.");

export const userProfileEmailSchema = z
  .string()
  .trim()
  .email("Укажите корректный email.")
  .max(160, "Email слишком длинный.");

export const updateUserProfileSchema = z.object({
  name: userProfileNameSchema,
  email: userProfileEmailSchema.optional()
});

export const updateUserAvatarSchema = z.object({
  imageDataUrl: z.string().trim().min(1)
});

export interface AvatarValidationResult {
  ok: boolean;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

export function getInitials(name: string): string {
  const normalized = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return normalized.join("") || "U";
}

export function validateAvatarDataUrl(
  dataUrl: string,
  maxBytes = 2 * 1024 * 1024
): AvatarValidationResult {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl.trim());
  if (!match) {
    return {
      ok: false,
      error: "Неверный формат аватара. Используйте изображение JPG, PNG или WEBP."
    };
  }

  const mimeType = match[1].toLowerCase();
  if (!avatarMimeTypes.has(mimeType)) {
    return {
      ok: false,
      error: "Недопустимый формат аватара. Разрешены JPG, PNG и WEBP."
    };
  }

  const base64Payload = match[2];
  const sizeBytes = Buffer.from(base64Payload, "base64").byteLength;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return {
      ok: false,
      error: "Не удалось прочитать файл аватара."
    };
  }

  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `Размер аватара превышает лимит ${Math.round(maxBytes / 1024 / 1024)} МБ.`
    };
  }

  return {
    ok: true,
    mimeType,
    sizeBytes
  };
}
