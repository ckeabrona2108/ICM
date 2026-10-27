import type { SmartLinkAccent, SmartLinkButtonShape } from "@/lib/smart-link-service";

export const SMART_LINK_ACCENT_OPTIONS: Array<{ value: SmartLinkAccent; label: string; swatch: string }> = [
  { value: "brand", label: "Фирменный", swatch: "#ff2140" },
  { value: "mono", label: "Монохром", swatch: "#fafafa" },
  { value: "violet", label: "Фиолетовый", swatch: "#7b6cff" },
  { value: "green", label: "Зелёный", swatch: "#22c55e" }
];

export const SMART_LINK_SHAPE_OPTIONS: Array<{ value: SmartLinkButtonShape; label: string }> = [
  { value: "round", label: "Скруглённые" },
  { value: "pill", label: "Таблетки" },
  { value: "square", label: "Строгие" }
];

export function getSmartLinkAccentColors(accent: SmartLinkAccent, isLight: boolean): { background: string; color: string } {
  switch (accent) {
    case "mono":
      return isLight ? { background: "#111114", color: "#ffffff" } : { background: "#fafafa", color: "#0b0b10" };
    case "violet":
      return { background: "#7b6cff", color: "#ffffff" };
    case "green":
      return { background: "#22c55e", color: "#0b0b10" };
    default:
      return { background: "#ff2140", color: "#ffffff" };
  }
}

export function getSmartLinkShapeRadius(shape: SmartLinkButtonShape): { card: string; button: string } {
  switch (shape) {
    case "pill":
      return { card: "999px", button: "999px" };
    case "square":
      return { card: "6px", button: "4px" };
    default:
      return { card: "18px", button: "14px" };
  }
}
