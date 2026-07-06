"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  CheckCheck,
  ImagePlus,
  MapPinned,
  Plus,
  Save,
  Search,
  Ticket,
  Trash2,
  Users2,
  Wallet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { YandexVenueMap, searchYandexVenues } from "@/components/events/yandex-venue-map";
import {
  ageRestrictionOptions,
  artistRoleOptions,
  buildMapsUrl,
  eventStatusOptions,
  eventTypeOptions,
  formatEventDate,
  formatMoney,
  fromDatetimeLocalInput,
  joinCommaValues,
  splitCommaValues,
  ticketKindOptions,
  toDatetimeLocalInput
} from "@/lib/events-shared";

type EventArtistForm = {
  id?: string;
  artistUserId?: string | null;
  displayName: string;
  photoUrl: string | null;
  role: string;
  performanceTime: string | null;
  sortOrder: number;
  bio: string;
  socialLinks: Record<string, string>;
};

type EventImageForm = {
  id?: string;
  imageUrl: string;
  altText: string;
  kind: string;
  isCover: boolean;
  sortOrder: number;
};

type EventTicketTypeForm = {
  id?: string;
  kind: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  quantityTotal: number;
  quantitySold?: number;
  remaining?: number;
  perUserLimit: number;
  salesStartAt: string;
  salesEndAt: string;
  enabled: boolean;
  sortOrder: number;
  kindLabel?: string;
};

type EventOwnerView = {
  id: string;
  title: string;
  slug: string;
  eventType: string;
  eventTypeLabel: string;
  ageRestriction: string;
  ageRestrictionLabel: string;
  description: string;
  hashtags: string[];
  genres: string[];
  startsAt: string;
  endsAt: string;
  city: string;
  venueName: string;
  address: string;
  coverImageUrl: string;
  posterImageUrl: string;
  currency: string;
  ticketSalesEnabled: boolean;
  ticketTerms: string;
  status: string;
  statusLabel: string;
  moderationNote: string;
  tags: string[];
  artists: Array<{
    id: string;
    artistUserId: string | null;
    displayName: string;
    photoUrl: string | null;
    role: string;
    roleLabel: string;
    performanceTime: string | null;
    sortOrder: number;
    bio: string;
    socialLinks: Record<string, string>;
  }>;
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string;
    kind: string;
    isCover: boolean;
    sortOrder: number;
  }>;
  ticketTypes: EventTicketTypeForm[];
  venue: {
    id: string;
    name: string;
    city: string;
    address: string;
    placeId: string;
    mapProvider: string;
    latitude: number | null;
    longitude: number | null;
  };
  orders: Array<{
    id: string;
    buyerEmail: string;
    buyerPhone: string | null;
    quantity: number;
    totalAmount: number;
    currency: string;
    status: string;
    statusLabel: string;
    createdAt: string;
    ticketTypeName: string;
    tickets: Array<{
      id: string;
      ticketCode: string;
      status: string;
      statusLabel: string;
    }>;
  }>;
  checkins: Array<{
    id: string;
    ticketCode: string;
    method: string;
    gateName: string;
    notes: string;
    createdAt: string;
  }>;
  finance: {
    gross: number;
    commission: number;
    net: number;
  };
};

type VenueSuggestion = {
  id: string;
  name: string;
  city: string;
  address: string;
  placeId: string;
  mapProvider: string;
  latitude: number | null;
  longitude: number | null;
};

type EventFormState = {
  title: string;
  slug: string;
  eventType: string;
  ageRestriction: string;
  description: string;
  hashtagsInput: string;
  genresInput: string;
  tagsInput: string;
  startsAt: string;
  endsAt: string;
  city: string;
  venueName: string;
  address: string;
  country: string;
  placeId: string;
  mapProvider: string;
  latitude: string;
  longitude: string;
  coverImageUrl: string;
  posterImageUrl: string;
  currency: string;
  ticketSalesEnabled: boolean;
  ticketTerms: string;
  status: string;
  moderationNote: string;
  artists: EventArtistForm[];
  images: EventImageForm[];
  ticketTypes: EventTicketTypeForm[];
};

type ValidationIssue = {
  message: string;
  path?: Array<string | number>;
};

type FieldErrors = Record<string, string[]>;

function buildVenueSuggestionKey(venue: VenueSuggestion) {
  return venue.placeId || `${venue.name}|${venue.address}|${venue.latitude ?? ""}|${venue.longitude ?? ""}`;
}

function mergeVenueSuggestions(primary: VenueSuggestion[], secondary: VenueSuggestion[]) {
  const seen = new Set<string>();
  const merged: VenueSuggestion[] = [];
  for (const venue of [...primary, ...secondary]) {
    const key = buildVenueSuggestionKey(venue);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(venue);
  }
  return merged;
}

function mapValidationIssues(issues: ValidationIssue[]): FieldErrors {
  return issues.reduce<FieldErrors>((acc, issue) => {
    const key = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "form";
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue.message);
    return acc;
  }, {});
}

function parseValidationIssues(payload: unknown): ValidationIssue[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is ValidationIssue => Boolean(item) && typeof item === "object" && "message" in item);
  }
  return [];
}

function firstFieldError(errors: FieldErrors, path: string) {
  return errors[path]?.[0] ?? "";
}

function hasNestedErrors(errors: FieldErrors, prefix: string) {
  return Object.keys(errors).some((key) => key === prefix || key.startsWith(`${prefix}.`));
}

function emptyArtist(sortOrder: number): EventArtistForm {
  return {
    displayName: "",
    photoUrl: null,
    role: "ARTIST",
    performanceTime: null,
    sortOrder,
    bio: "",
    socialLinks: {}
  };
}

function emptyImage(sortOrder: number): EventImageForm {
  return {
    imageUrl: "",
    altText: "",
    kind: "gallery",
    isCover: false,
    sortOrder
  };
}

function emptyTicketType(sortOrder: number): EventTicketTypeForm {
  return {
    kind: "REGULAR",
    name: "",
    description: "",
    price: 0,
    currency: "RUB",
    quantityTotal: 100,
    perUserLimit: 10,
    salesStartAt: "",
    salesEndAt: "",
    enabled: true,
    sortOrder
  };
}

function createEmptyForm(): EventFormState {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const start = now.toISOString().slice(0, 16);
  return {
    title: "",
    slug: "",
    eventType: "CONCERT",
    ageRestriction: "AGE_18",
    description: "",
    hashtagsInput: "",
    genresInput: "",
    tagsInput: "",
    startsAt: start,
    endsAt: "",
    city: "",
    venueName: "",
    address: "",
    country: "Россия",
    placeId: "",
    mapProvider: "yandex",
    latitude: "",
    longitude: "",
    coverImageUrl: "",
    posterImageUrl: "",
    currency: "RUB",
    ticketSalesEnabled: true,
    ticketTerms: "",
    status: "DRAFT",
    moderationNote: "",
    artists: [emptyArtist(0)],
    images: [emptyImage(0)],
    ticketTypes: [emptyTicketType(0)]
  };
}

function mapInitialData(initialData?: EventOwnerView | null): EventFormState {
  if (!initialData) return createEmptyForm();
  return {
    title: initialData.title,
    slug: initialData.slug,
    eventType: initialData.eventType,
    ageRestriction: initialData.ageRestriction,
    description: initialData.description,
    hashtagsInput: joinCommaValues(initialData.hashtags),
    genresInput: joinCommaValues(initialData.genres),
    tagsInput: joinCommaValues(initialData.tags),
    startsAt: toDatetimeLocalInput(initialData.startsAt),
    endsAt: toDatetimeLocalInput(initialData.endsAt),
    city: initialData.city,
    venueName: initialData.venueName,
    address: initialData.address,
    country: "",
    placeId: initialData.venue.placeId,
    mapProvider: initialData.venue.mapProvider || "yandex",
    latitude: initialData.venue.latitude?.toString() ?? "",
    longitude: initialData.venue.longitude?.toString() ?? "",
    coverImageUrl: initialData.coverImageUrl,
    posterImageUrl: initialData.posterImageUrl,
    currency: initialData.currency,
    ticketSalesEnabled: initialData.ticketSalesEnabled,
    ticketTerms: initialData.ticketTerms,
    status: initialData.status,
    moderationNote: initialData.moderationNote,
    artists: initialData.artists.length
      ? initialData.artists.map((artist, index) => ({
          id: artist.id,
          artistUserId: artist.artistUserId,
          displayName: artist.displayName,
          photoUrl: artist.photoUrl ?? null,
          role: artist.role,
          performanceTime: artist.performanceTime ?? null,
          sortOrder: artist.sortOrder ?? index,
          bio: artist.bio,
          socialLinks: artist.socialLinks ?? {}
        }))
      : [emptyArtist(0)],
    images: initialData.images.length
      ? initialData.images.map((image, index) => ({
          id: image.id,
          imageUrl: image.imageUrl,
          altText: image.altText,
          kind: image.kind,
          isCover: image.isCover,
          sortOrder: image.sortOrder ?? index
        }))
      : [emptyImage(0)],
    ticketTypes: initialData.ticketTypes.length
      ? initialData.ticketTypes.map((ticketType, index) => ({
          id: ticketType.id,
          kind: ticketType.kind,
          name: ticketType.name,
          description: ticketType.description,
          price: ticketType.price,
          currency: ticketType.currency,
          quantityTotal: ticketType.quantityTotal,
          quantitySold: ticketType.quantitySold,
          remaining: ticketType.remaining,
          perUserLimit: ticketType.perUserLimit,
          salesStartAt: toDatetimeLocalInput(ticketType.salesStartAt),
          salesEndAt: toDatetimeLocalInput(ticketType.salesEndAt),
          enabled: ticketType.enabled,
          sortOrder: ticketType.sortOrder ?? index,
          kindLabel: ticketType.kindLabel
        }))
      : [emptyTicketType(0)]
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">{children}</label>;
}

export function EventEditorClient(props: {
  mode: "create" | "edit";
  eventId?: string;
  initialData?: EventOwnerView | null;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<EventFormState>(() => mapInitialData(props.initialData));
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [venueQuery, setVenueQuery] = React.useState("");
  const [venueSuggestions, setVenueSuggestions] = React.useState<VenueSuggestion[]>([]);
  const [isSearchingVenues, setIsSearchingVenues] = React.useState(false);
  const [checkInCode, setCheckInCode] = React.useState("");
  const [checkInMessage, setCheckInMessage] = React.useState("");
  const [checkInError, setCheckInError] = React.useState("");
  const [isCheckingIn, setIsCheckingIn] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  function clearFieldErrors(paths: string[]) {
    setFieldErrors((current) => {
      if (!paths.some((path) => current[path])) return current;
      const next = { ...current };
      for (const path of paths) delete next[path];
      return next;
    });
  }

  function updateField<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    clearFieldErrors([String(key), "form"]);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateArtist(index: number, patch: Partial<EventArtistForm>) {
    clearFieldErrors(Object.keys(patch).map((key) => `artists.${index}.${key}`));
    setForm((current) => ({
      ...current,
      artists: current.artists.map((artist, itemIndex) => (itemIndex === index ? { ...artist, ...patch } : artist))
    }));
  }

  function updateImage(index: number, patch: Partial<EventImageForm>) {
    clearFieldErrors(Object.keys(patch).map((key) => `images.${index}.${key}`));
    setForm((current) => ({
      ...current,
      images: current.images.map((image, itemIndex) => (itemIndex === index ? { ...image, ...patch } : image))
    }));
  }

  function updateTicketType(index: number, patch: Partial<EventTicketTypeForm>) {
    clearFieldErrors(Object.keys(patch).map((key) => `ticketTypes.${index}.${key}`));
    setForm((current) => ({
      ...current,
      ticketTypes: current.ticketTypes.map((ticketType, itemIndex) =>
        itemIndex === index ? { ...ticketType, ...patch } : ticketType
      )
    }));
  }

  async function searchVenues() {
    if (!venueQuery.trim()) return;
    setIsSearchingVenues(true);
    setSaveError("");
    try {
      const cleanQuery = venueQuery.trim();
      const [localVenues, yandexVenues] = await Promise.all([
        fetch(`/api/events/venues/search?q=${encodeURIComponent(cleanQuery)}`).then(async (response) => {
          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error || "Не удалось найти площадки.");
          }
          return (json.venues ?? []) as VenueSuggestion[];
        }),
        searchYandexVenues(cleanQuery)
      ]);
      const merged = mergeVenueSuggestions(localVenues, yandexVenues);
      setVenueSuggestions(merged);
      if (!merged.length) {
        setSaveError("По этому запросу ничего не найдено ни локально, ни в Яндекс Картах.");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось найти площадки.");
    } finally {
      setIsSearchingVenues(false);
    }
  }

  function applyVenueSuggestion(venue: VenueSuggestion) {
    setForm((current) => ({
      ...current,
      venueName: venue.name,
      city: venue.city || current.city,
      address: venue.address || current.address,
      placeId: venue.placeId,
      mapProvider: venue.mapProvider || current.mapProvider,
      latitude: venue.latitude?.toString() ?? "",
      longitude: venue.longitude?.toString() ?? ""
    }));
    setVenueSuggestions([]);
    setVenueQuery("");
  }

  const mapPreviewUrl = buildMapsUrl({
    latitude: form.latitude ? Number(form.latitude) : null,
    longitude: form.longitude ? Number(form.longitude) : null,
    address: form.address
  });

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError("");
    setSaveMessage("");
    setFieldErrors({});

    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        eventType: form.eventType,
        ageRestriction: form.ageRestriction,
        description: form.description,
        hashtags: splitCommaValues(form.hashtagsInput),
        genres: splitCommaValues(form.genresInput),
        startsAt: fromDatetimeLocalInput(form.startsAt),
        endsAt: form.endsAt ? fromDatetimeLocalInput(form.endsAt) : "",
        city: form.city,
        venueName: form.venueName,
        address: form.address,
        country: form.country,
        placeId: form.placeId,
        mapProvider: form.mapProvider,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        coverImageUrl: form.coverImageUrl,
        posterImageUrl: form.posterImageUrl,
        currency: form.currency,
        ticketSalesEnabled: form.ticketSalesEnabled,
        ticketTerms: form.ticketTerms,
        status: form.status,
        moderationNote: form.moderationNote,
        tags: splitCommaValues(form.tagsInput),
        artists: form.artists.map((artist, index) => ({
          id: artist.id,
          artistUserId: artist.artistUserId ?? null,
          displayName: artist.displayName,
          photoUrl: artist.photoUrl ?? "",
          role: artist.role,
          performanceTime: artist.performanceTime ?? "",
          sortOrder: index,
          bio: artist.bio,
          socialLinks: artist.socialLinks
        })),
        images: form.images
          .filter((image) => image.imageUrl.trim())
          .map((image, index) => ({
            id: image.id,
            imageUrl: image.imageUrl,
            altText: image.altText,
            kind: image.kind,
            isCover: image.isCover,
            sortOrder: index
          })),
        ticketTypes: form.ticketTypes.map((ticketType, index) => ({
          id: ticketType.id,
          kind: ticketType.kind,
          name: ticketType.name,
          description: ticketType.description,
          price: ticketType.price,
          currency: ticketType.currency,
          quantityTotal: ticketType.quantityTotal,
          perUserLimit: ticketType.perUserLimit,
          salesStartAt: ticketType.salesStartAt ? fromDatetimeLocalInput(ticketType.salesStartAt) : "",
          salesEndAt: ticketType.salesEndAt ? fromDatetimeLocalInput(ticketType.salesEndAt) : "",
          enabled: ticketType.enabled,
          sortOrder: index
        }))
      };

      const response = await fetch(props.mode === "create" ? "/api/events" : `/api/events/${props.eventId}`, {
        method: props.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok) {
        const issues = parseValidationIssues(json.issues);
        if (issues.length) {
          setFieldErrors(mapValidationIssues(issues));
          setSaveError("Проверьте поля формы.");
          return;
        }

        if (typeof json.error === "string" && json.error.trim().startsWith("[")) {
          try {
            const parsedIssues = parseValidationIssues(JSON.parse(json.error));
            if (parsedIssues.length) {
              setFieldErrors(mapValidationIssues(parsedIssues));
              setSaveError("Проверьте поля формы.");
              return;
            }
          } catch {}
        }

        throw new Error(json.error || "Не удалось сохранить событие.");
      }

      setSaveMessage(props.mode === "create" ? "Событие создано." : "Изменения сохранены.");
      const targetId = json.eventId;
      if (props.mode === "create" && targetId) {
        router.push(`/dashboard/events/${targetId}`);
        router.refresh();
        return;
      }
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить событие.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!props.eventId) return;
    if (!window.confirm("Удалить событие?")) return;
    setIsDeleting(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/events/${props.eventId}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Не удалось удалить событие.");
      }
      router.push("/dashboard/events");
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось удалить событие.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.eventId) return;
    setIsCheckingIn(true);
    setCheckInError("");
    setCheckInMessage("");

    try {
      const response = await fetch(`/api/events/${props.eventId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketCode: checkInCode,
          method: "manual"
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Не удалось отметить проход.");
      }
      setCheckInMessage(`Билет ${json.ticketCode} отмечен как ${json.statusLabel}.`);
      setCheckInCode("");
      router.refresh();
    } catch (error) {
      setCheckInError(error instanceof Error ? error.message : "Не удалось отметить проход.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Основная информация</CardTitle>
            <CardDescription>
              Заголовок, статус и базовая карточка публичной страницы концерта или вечеринки.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <SectionLabel>Название события</SectionLabel>
              <Input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="NO SLEEP OPEN AIR"
                className={firstFieldError(fieldErrors, "title") ? "border-red-400/60 ring-2 ring-red-500/30" : ""}
              />
              {firstFieldError(fieldErrors, "title") ? <p className="mt-2 text-sm text-red-300">{firstFieldError(fieldErrors, "title")}</p> : null}
            </div>
            <div>
              <SectionLabel>Slug</SectionLabel>
              <Input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="no-sleep-open-air" />
            </div>
            <div>
              <SectionLabel>Статус</SectionLabel>
              <Select value={form.status} onChange={(event) => updateField("status", event.target.value)} options={eventStatusOptions.map((option) => ({ ...option }))} />
            </div>
            <div>
              <SectionLabel>Тип события</SectionLabel>
              <Select value={form.eventType} onChange={(event) => updateField("eventType", event.target.value)} options={eventTypeOptions.map((option) => ({ ...option }))} />
            </div>
            <div>
              <SectionLabel>Возрастное ограничение</SectionLabel>
              <Select value={form.ageRestriction} onChange={(event) => updateField("ageRestriction", event.target.value)} options={ageRestrictionOptions.map((option) => ({ ...option }))} />
            </div>
            <div>
              <SectionLabel>Дата и время начала</SectionLabel>
              <Input type="datetime-local" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} />
            </div>
            <div>
              <SectionLabel>Дата и время окончания</SectionLabel>
              <Input type="datetime-local" value={form.endsAt} onChange={(event) => updateField("endsAt", event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <SectionLabel>Описание</SectionLabel>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Расскажите о программе, лайн-апе и атмосфере события."
                className="min-h-[140px] w-full rounded-2xl border border-white/[0.12] bg-black/25 px-4 py-3 text-[15px] font-medium text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60"
              />
            </div>
            <div>
              <SectionLabel>Хештеги</SectionLabel>
              <Input value={form.hashtagsInput} onChange={(event) => updateField("hashtagsInput", event.target.value)} placeholder="вечеринка, 18+, house, dj set" />
            </div>
            <div>
              <SectionLabel>Жанры</SectionLabel>
              <Input value={form.genresInput} onChange={(event) => updateField("genresInput", event.target.value)} placeholder="Hip-Hop, Trap, House" />
            </div>
            <div className="md:col-span-2">
              <SectionLabel>Дополнительные теги</SectionLabel>
              <Input value={form.tagsInput} onChange={(event) => updateField("tagsInput", event.target.value)} placeholder="open air, afterparty, live" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Venue / карта</CardTitle>
            <CardDescription>
              Сохраните площадку, адрес и координаты. Поиск объединяет локальные venue и Яндекс Карты, а ниже сразу показывается карта выбранного места.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input value={venueQuery} onChange={(event) => setVenueQuery(event.target.value)} placeholder="Найти площадку по названию или адресу" className="flex-1" />
              <Button type="button" variant="outline" onClick={searchVenues} disabled={isSearchingVenues} className="gap-2">
                <Search className="h-4 w-4" />
                {isSearchingVenues ? "Ищем..." : "Найти"}
              </Button>
            </div>

            {venueSuggestions.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {venueSuggestions.map((venue) => (
                  <button
                    key={venue.id}
                    type="button"
                    onClick={() => applyVenueSuggestion(venue)}
                    className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-left transition hover:border-violet-400/30 hover:bg-violet-500/8"
                  >
                    <p className="font-semibold text-white">{venue.name}</p>
                    <p className="mt-1 text-sm text-white/58">{venue.city || "—"}</p>
                    <p className="mt-2 text-sm text-white/52">{venue.address || "Адрес не указан"}</p>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <SectionLabel>Площадка</SectionLabel>
                <Input
                  value={form.venueName}
                  onChange={(event) => updateField("venueName", event.target.value)}
                  placeholder="Mutabor"
                  className={firstFieldError(fieldErrors, "venueName") ? "border-red-400/60 ring-2 ring-red-500/30" : ""}
                />
                {firstFieldError(fieldErrors, "venueName") ? <p className="mt-2 text-sm text-red-300">{firstFieldError(fieldErrors, "venueName")}</p> : null}
              </div>
              <div>
                <SectionLabel>Город</SectionLabel>
                <Input value={form.city} onChange={(event) => updateField("city", event.target.value)} placeholder="Москва" />
              </div>
              <div className="md:col-span-2">
                <SectionLabel>Адрес</SectionLabel>
                <Input
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="ул. Пример, 1"
                  className={firstFieldError(fieldErrors, "address") ? "border-red-400/60 ring-2 ring-red-500/30" : ""}
                />
                {firstFieldError(fieldErrors, "address") ? <p className="mt-2 text-sm text-red-300">{firstFieldError(fieldErrors, "address")}</p> : null}
              </div>
              <div>
                <SectionLabel>Country</SectionLabel>
                <Input value={form.country} onChange={(event) => updateField("country", event.target.value)} placeholder="Россия" />
              </div>
              <div>
                <SectionLabel>Map provider</SectionLabel>
                <Input value={form.mapProvider} onChange={(event) => updateField("mapProvider", event.target.value)} placeholder="yandex" />
              </div>
              <div>
                <SectionLabel>Latitude</SectionLabel>
                <Input value={form.latitude} onChange={(event) => updateField("latitude", event.target.value)} placeholder="55.751244" />
              </div>
              <div>
                <SectionLabel>Longitude</SectionLabel>
                <Input value={form.longitude} onChange={(event) => updateField("longitude", event.target.value)} placeholder="37.618423" />
              </div>
              <div className="md:col-span-2">
                <SectionLabel>Place ID</SectionLabel>
                <Input value={form.placeId} onChange={(event) => updateField("placeId", event.target.value)} placeholder="optional provider place id" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">Карта площадки</p>
                  <p className="mt-1 text-sm text-white/54">Предпросмотр места на Яндекс Картах по выбранным координатам.</p>
                </div>
                {mapPreviewUrl ? (
                  <a
                    href={mapPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-violet-200 transition hover:text-white"
                  >
                    Открыть в Яндекс Картах
                  </a>
                ) : null}
              </div>
              <YandexVenueMap
                latitude={form.latitude ? Number(form.latitude) : null}
                longitude={form.longitude ? Number(form.longitude) : null}
                title={form.venueName}
                address={form.address}
                emptyMessage="Ищите площадку через Яндекс или укажите координаты вручную, и карта появится здесь."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Визуалы</CardTitle>
            <CardDescription>Обложка, афиша и галерея, которые будут показаны на публичной странице события.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <SectionLabel>Обложка</SectionLabel>
                <Input value={form.coverImageUrl} onChange={(event) => updateField("coverImageUrl", event.target.value)} placeholder="https://..." />
              </div>
              <div>
                <SectionLabel>Афиша</SectionLabel>
                <Input value={form.posterImageUrl} onChange={(event) => updateField("posterImageUrl", event.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="space-y-3">
              {form.images.map((image, index) => (
                <div key={`${image.id ?? "new"}-${index}`} className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <SectionLabel>URL изображения #{index + 1}</SectionLabel>
                      <Input value={image.imageUrl} onChange={(event) => updateImage(index, { imageUrl: event.target.value })} placeholder="https://..." />
                    </div>
                    <div>
                      <SectionLabel>Alt text</SectionLabel>
                      <Input value={image.altText} onChange={(event) => updateImage(index, { altText: event.target.value })} placeholder="Афиша концерта" />
                    </div>
                    <div>
                      <SectionLabel>Kind</SectionLabel>
                      <Input value={image.kind} onChange={(event) => updateImage(index, { kind: event.target.value })} placeholder="gallery / backstage" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-white/66">
                      <input type="checkbox" checked={image.isCover} onChange={(event) => updateImage(index, { isCover: event.target.checked })} />
                      Cover flag
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-2 text-red-200 hover:text-white"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          images: current.images.filter((_, itemIndex) => itemIndex !== index)
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    images: [...current.images, emptyImage(current.images.length)]
                  }))
                }
              >
                <ImagePlus className="h-4 w-4" />
                Добавить фото
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Артисты и участники</CardTitle>
            <CardDescription>Line-up с ролями, слотами и фото. Можно добавлять как вручную, так и под существующие профили.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.artists.map((artist, index) => (
              <div
                key={`${artist.id ?? "new"}-${index}`}
                className={cn(
                  "rounded-3xl border bg-black/20 p-4",
                  hasNestedErrors(fieldErrors, `artists.${index}`) ? "border-red-400/40" : "border-white/[0.08]"
                )}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <SectionLabel>Имя / display</SectionLabel>
                    <Input
                      value={artist.displayName}
                      onChange={(event) => updateArtist(index, { displayName: event.target.value })}
                      placeholder="DJ No Sleep"
                      className={firstFieldError(fieldErrors, `artists.${index}.displayName`) ? "border-red-400/60 ring-2 ring-red-500/30" : ""}
                    />
                    {firstFieldError(fieldErrors, `artists.${index}.displayName`) ? (
                      <p className="mt-2 text-sm text-red-300">{firstFieldError(fieldErrors, `artists.${index}.displayName`)}</p>
                    ) : null}
                  </div>
                  <div>
                    <SectionLabel>Роль</SectionLabel>
                    <Select value={artist.role} onChange={(event) => updateArtist(index, { role: event.target.value })} options={artistRoleOptions.map((option) => ({ ...option }))} />
                  </div>
                  <div>
                    <SectionLabel>Фото</SectionLabel>
                    <Input value={artist.photoUrl ?? ""} onChange={(event) => updateArtist(index, { photoUrl: event.target.value })} placeholder="https://..." />
                  </div>
                  <div>
                    <SectionLabel>Время выступления</SectionLabel>
                    <Input value={artist.performanceTime ?? ""} onChange={(event) => updateArtist(index, { performanceTime: event.target.value })} placeholder="23:30 - 00:30" />
                  </div>
                  <div className="md:col-span-2">
                    <SectionLabel>Описание</SectionLabel>
                    <textarea
                      value={artist.bio}
                      onChange={(event) => updateArtist(index, { bio: event.target.value })}
                      placeholder="Короткое описание артиста."
                      className="min-h-[110px] w-full rounded-2xl border border-white/[0.12] bg-black/25 px-4 py-3 text-[15px] font-medium text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 text-red-200 hover:text-white"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        artists: current.artists.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить участника
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  artists: [...current.artists, emptyArtist(current.artists.length)]
                }))
              }
            >
              <Plus className="h-4 w-4" />
              Добавить участника
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Билеты</CardTitle>
            <CardDescription>Типы билетов, лимиты, даты продаж и количество доступных мест для каждого типа.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <SectionLabel>Валюта</SectionLabel>
                <Input value={form.currency} onChange={(event) => updateField("currency", event.target.value)} placeholder="RUB" />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-white/66">
                  <input
                    type="checkbox"
                    checked={form.ticketSalesEnabled}
                    onChange={(event) => updateField("ticketSalesEnabled", event.target.checked)}
                  />
                  Продажа билетов включена
                </label>
              </div>
            </div>

            {form.ticketTypes.map((ticketType, index) => (
              <div
                key={`${ticketType.id ?? "new"}-${index}`}
                className={cn(
                  "rounded-3xl border bg-black/20 p-4",
                  hasNestedErrors(fieldErrors, `ticketTypes.${index}`) ? "border-red-400/40" : "border-white/[0.08]"
                )}
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <SectionLabel>Тип</SectionLabel>
                    <Select value={ticketType.kind} onChange={(event) => updateTicketType(index, { kind: event.target.value })} options={ticketKindOptions.map((option) => ({ ...option }))} />
                  </div>
                  <div>
                    <SectionLabel>Название</SectionLabel>
                    <Input
                      value={ticketType.name}
                      onChange={(event) => updateTicketType(index, { name: event.target.value })}
                      placeholder="Regular"
                      className={firstFieldError(fieldErrors, `ticketTypes.${index}.name`) ? "border-red-400/60 ring-2 ring-red-500/30" : ""}
                    />
                    {firstFieldError(fieldErrors, `ticketTypes.${index}.name`) ? (
                      <p className="mt-2 text-sm text-red-300">{firstFieldError(fieldErrors, `ticketTypes.${index}.name`)}</p>
                    ) : null}
                  </div>
                  <div>
                    <SectionLabel>Цена</SectionLabel>
                    <Input type="number" min="0" value={ticketType.price} onChange={(event) => updateTicketType(index, { price: Number(event.target.value) })} />
                  </div>
                  <div>
                    <SectionLabel>Количество</SectionLabel>
                    <Input type="number" min="0" value={ticketType.quantityTotal} onChange={(event) => updateTicketType(index, { quantityTotal: Number(event.target.value) })} />
                  </div>
                  <div>
                    <SectionLabel>Лимит на человека</SectionLabel>
                    <Input type="number" min="1" value={ticketType.perUserLimit} onChange={(event) => updateTicketType(index, { perUserLimit: Number(event.target.value) })} />
                  </div>
                  <div>
                    <SectionLabel>Старт продаж</SectionLabel>
                    <Input type="datetime-local" value={ticketType.salesStartAt} onChange={(event) => updateTicketType(index, { salesStartAt: event.target.value })} />
                  </div>
                  <div>
                    <SectionLabel>Конец продаж</SectionLabel>
                    <Input type="datetime-local" value={ticketType.salesEndAt} onChange={(event) => updateTicketType(index, { salesEndAt: event.target.value })} />
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-white/66">
                      <input type="checkbox" checked={ticketType.enabled} onChange={(event) => updateTicketType(index, { enabled: event.target.checked })} />
                      Тип активен
                    </label>
                  </div>
                  <div className="xl:col-span-4">
                    <SectionLabel>Описание билета</SectionLabel>
                    <textarea
                      value={ticketType.description ?? ""}
                      onChange={(event) => updateTicketType(index, { description: event.target.value })}
                      placeholder="Что входит в билет, доступ к зонам, guest list и т.д."
                      className="min-h-[110px] w-full rounded-2xl border border-white/[0.12] bg-black/25 px-4 py-3 text-[15px] font-medium text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/54">
                    {typeof ticketType.quantitySold === "number" ? (
                      <span>
                        Продано {ticketType.quantitySold} · Осталось {ticketType.remaining ?? Math.max(0, ticketType.quantityTotal - ticketType.quantitySold)}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 text-red-200 hover:text-white"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        ticketTypes: current.ticketTypes.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить тип
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  ticketTypes: [...current.ticketTypes, emptyTicketType(current.ticketTypes.length)]
                }))
              }
            >
              <Ticket className="h-4 w-4" />
              Добавить тип билета
            </Button>

            <div>
              <SectionLabel>Условия билетов</SectionLabel>
              <textarea
                value={form.ticketTerms}
                onChange={(event) => updateField("ticketTerms", event.target.value)}
                placeholder="Возвраты, вход по документу, правила прохода."
                className="min-h-[120px] w-full rounded-2xl border border-white/[0.12] bg-black/25 px-4 py-3 text-[15px] font-medium text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60"
              />
            </div>
          </CardContent>
        </Card>

        {(saveError || saveMessage) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              saveError
                ? "border-red-400/22 bg-red-500/10 text-red-100"
                : "border-emerald-400/22 bg-emerald-500/10 text-emerald-50"
            }`}
          >
            {saveError || firstFieldError(fieldErrors, "form") || saveMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="gap-2" disabled={isSaving}>
            <Save className="h-4 w-4" />
            {isSaving ? "Сохраняем..." : props.mode === "create" ? "Создать событие" : "Сохранить изменения"}
          </Button>
          {props.mode === "edit" ? (
            <Button type="button" variant="ghost" className="gap-2 text-red-200 hover:text-white" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Удаляем..." : "Удалить событие"}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Сводка события</CardTitle>
            <CardDescription>Ключевые KPI по билетам, продажам и проверкам на входе.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Дата старта</p>
              <p className="mt-2 text-sm font-semibold text-white">{props.initialData ? formatEventDate(props.initialData.startsAt) : "После создания"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Билеты</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {props.initialData
                  ? `${props.initialData.ticketTypes.reduce((sum, item) => sum + (item.quantitySold ?? 0), 0)} / ${props.initialData.ticketTypes.reduce((sum, item) => sum + item.quantityTotal, 0)}`
                  : "0 / 0"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Gross sales</p>
              <p className="mt-2 text-sm font-semibold text-white">{formatMoney(props.initialData?.finance.gross ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Организатору</p>
              <p className="mt-2 text-sm font-semibold text-white">{formatMoney(props.initialData?.finance.net ?? 0)}</p>
            </div>
          </CardContent>
        </Card>

        {props.mode === "edit" && props.eventId ? (
          <Card>
            <CardHeader>
              <CardTitle>QR Check-in</CardTitle>
              <CardDescription>Ручной check-in по ticket code для организатора. Защита от повторного прохода встроена на уровне статуса билета.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCheckIn} className="space-y-4">
                <div>
                  <SectionLabel>Ticket code</SectionLabel>
                  <Input value={checkInCode} onChange={(event) => setCheckInCode(event.target.value)} placeholder="ICM-XXXXXXXXXXXX" />
                </div>
                {checkInError ? <div className="rounded-2xl border border-red-400/22 bg-red-500/10 px-4 py-3 text-sm text-red-100">{checkInError}</div> : null}
                {checkInMessage ? <div className="rounded-2xl border border-emerald-400/22 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">{checkInMessage}</div> : null}
                <Button type="submit" className="gap-2" disabled={isCheckingIn}>
                  <CheckCheck className="h-4 w-4" />
                  {isCheckingIn ? "Проверяем..." : "Отметить проход"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Последние заказы</CardTitle>
            <CardDescription>Быстрый срез по последним оплатам и созданным билетам.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.initialData?.orders?.length ? (
              props.initialData.orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{order.buyerEmail}</p>
                      <p className="mt-1 text-sm text-white/58">
                        {order.ticketTypeName} · {order.quantity} шт. · {order.statusLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{formatMoney(order.totalAmount, order.currency)}</p>
                      <p className="mt-1 text-xs text-white/46">{formatEventDate(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.tickets.map((ticket) => (
                      <span
                        key={ticket.id}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/64"
                      >
                        {ticket.ticketCode} · {ticket.statusLabel}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/58">После первых продаж здесь появятся заказы и выданные билеты.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Последние проходы</CardTitle>
            <CardDescription>История check-in и последних успешных проходов на площадку.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.initialData?.checkins?.length ? (
              props.initialData.checkins.map((checkin) => (
                <div key={checkin.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-white">{checkin.ticketCode}</p>
                      <p className="mt-1 text-sm text-white/58">
                        {checkin.method}
                        {checkin.gateName ? ` · ${checkin.gateName}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-white/46">{formatEventDate(checkin.createdAt)}</p>
                  </div>
                  {checkin.notes ? <p className="mt-3 text-sm text-white/52">{checkin.notes}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-white/58">История check-in пока пуста.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
