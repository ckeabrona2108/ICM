export const eventTypeOptions = [
  { value: "CONCERT", label: "Концерт" },
  { value: "FESTIVAL", label: "Фестиваль" },
  { value: "CLUB_SHOW", label: "Клубное шоу" },
  { value: "LIVESTREAM", label: "Livestream" },
  { value: "SHOWCASE", label: "Showcase" },
  { value: "MEETUP", label: "Meetup" },
  { value: "OTHER", label: "Другое" }
] as const;

export const ageRestrictionOptions = [
  { value: "ALL_AGES", label: "0+" },
  { value: "AGE_6", label: "6+" },
  { value: "AGE_12", label: "12+" },
  { value: "AGE_16", label: "16+" },
  { value: "AGE_18", label: "18+" },
  { value: "AGE_21", label: "21+" }
] as const;

export const eventStatusOptions = [
  { value: "DRAFT", label: "Черновик" },
  { value: "PENDING_MODERATION", label: "На модерации" },
  { value: "PUBLISHED", label: "Опубликовано" },
  { value: "SOLD_OUT", label: "Sold Out" },
  { value: "CANCELLED", label: "Отменено" },
  { value: "FINISHED", label: "Завершено" },
  { value: "HIDDEN", label: "Скрыто" }
] as const;

export const artistRoleOptions = [
  { value: "HEADLINER", label: "Headliner" },
  { value: "ARTIST", label: "Artist" },
  { value: "DJ", label: "DJ" },
  { value: "MC", label: "MC" },
  { value: "GUEST", label: "Guest" },
  { value: "HOST", label: "Host" },
  { value: "SPECIAL_GUEST", label: "Special Guest" }
] as const;

export const ticketKindOptions = [
  { value: "REGULAR", label: "Regular" },
  { value: "EARLY_BIRD", label: "Early Bird" },
  { value: "VIP", label: "VIP" },
  { value: "BACKSTAGE", label: "Backstage" },
  { value: "GUEST_LIST", label: "Guest List" },
  { value: "FREE", label: "Free" }
] as const;

export function splitCommaValues(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinCommaValues(items: string[]) {
  return items.join(", ");
}

export function toDatetimeLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function fromDatetimeLocalInput(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

export function formatEventDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMoney(value: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function buildMapsUrl(params: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}) {
  if (typeof params.latitude === "number" && typeof params.longitude === "number") {
    return `https://yandex.ru/maps/?pt=${params.longitude},${params.latitude}&z=15`;
  }
  if (params.address?.trim()) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(params.address.trim())}`;
  }
  return "";
}
