import {
  applyHero,
  BODY_FONT,
  cachedCanvas,
  clamp,
  createCanvas,
  DISPLAY_FONT,
  drawCover,
  drawImageCover,
  drawPill,
  drawSpectrum,
  drawText,
  fitFontSize,
  formatClock,
  hash,
  hexToRgb,
  idleFloat,
  MONO_FONT,
  rgba,
  roundRectPath,
  type SceneContext,
  textMotion,
  wrapLines
} from "./draw-utils";
import type { TemplateId } from "./types";

type Align = "center" | "left";
interface ColumnItem {
  height: number;
  /** Cover items move to the left half in 16:9. */
  cover?: boolean;
  draw: (left: number, top: number, width: number, align: Align) => void;
}

export interface TemplateDefinition {
  /** The template's own backdrop, used when the background is "as in template". */
  ownBackground?: (scene: SceneContext) => void;
  /** Paper and full-bleed templates are built around their backdrop and never take a live one. */
  keepsOwnBackground?: boolean;
  draw: (scene: SceneContext) => void;
}

function isTall(scene: SceneContext) {
  return scene.height > scene.width * 1.4;
}

/** Stacks items vertically inside the safe area; in 16:9 the cover sits left and text right. */
/** Runs `draw` scaled down around (anchorX, top) when the stack is taller than the space it has. */
function fitStack(scene: SceneContext, total: number, available: number, anchorX: number, top: number, draw: () => void) {
  const scale = total > available ? available / total : 1;
  if (scale === 1) {
    draw();
    return;
  }
  const { ctx } = scene;
  ctx.save();
  ctx.translate(anchorX * (1 - scale), top * (1 - scale));
  ctx.scale(scale, scale);
  draw();
  ctx.restore();
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Stacks items vertically inside the safe area; in 16:9 the cover sits left and text right.
 * `backdrop` paints behind the stack, sized to exactly what was laid out (the glass card).
 */
function layoutColumn(
  scene: SceneContext,
  items: ColumnItem[],
  gap: number,
  options: { inset?: number; backdrop?: (rect: Rect) => void; padding?: number } = {}
) {
  const { width, height, isWide } = scene;
  const inset = options.inset ?? 0.08;
  const padding = options.padding ?? 0;
  const stackHeight = (list: ColumnItem[]) => list.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, list.length - 1);
  if (isWide) {
    const coverItems = items.filter((item) => item.cover);
    const textItems = items.filter((item) => !item.cover);
    const total = stackHeight(textItems);
    const available = height * 0.86 - padding * 2;
    const scale = total > available ? available / total : 1;
    const top = Math.max(height * 0.07 + padding, (height - total * scale) / 2);
    const coverHeight = coverItems.reduce((max, item) => Math.max(max, item.height), 0);
    const textLeft = coverHeight ? width * 0.1 + coverHeight + width * 0.06 : width * 0.12;
    if (options.backdrop) {
      const contentHeight = Math.max(coverHeight, total * scale);
      options.backdrop({ x: width * 0.1 - padding, y: (height - contentHeight) / 2 - padding, width: width * 0.8 + padding * 2, height: contentHeight + padding * 2 });
    }
    coverItems.forEach((item) => item.draw(width * 0.1, (height - item.height) / 2, item.height, "center"));
    fitStack(scene, total, available, textLeft, top, () => {
      let cursor = top;
      for (const item of textItems) {
        item.draw(textLeft, cursor, width * 0.9 - textLeft, "left");
        cursor += item.height + gap;
      }
    });
    return;
  }
  const safeTop = (isTall(scene) ? height * 0.13 : height * 0.06) + padding;
  // Square leaves room for the watermark line at the very bottom.
  const safeBottom = (isTall(scene) ? height * 0.8 : height * 0.9) - padding;
  const total = stackHeight(items);
  const top = safeTop + Math.max(0, (safeBottom - safeTop - total) / 2);
  const columnLeft = width * inset;
  const columnWidth = width * (1 - inset * 2);
  fitStack(scene, total, safeBottom - safeTop, width / 2, top, () => {
    options.backdrop?.({ x: columnLeft - padding, y: top - padding, width: columnWidth + padding * 2, height: total + padding * 2 });
    let cursor = top;
    for (const item of items) {
      item.draw(columnLeft, cursor, columnWidth, "center");
      cursor += item.height + gap;
    }
  });
}

function anchorX(left: number, width: number, align: Align) {
  return align === "center" ? left + width / 2 : left;
}

function coverSize(scene: SceneContext, fraction: number) {
  if (scene.isWide) return Math.min(scene.height * 0.64, scene.width * 0.36);
  return scene.width * (isTall(scene) ? fraction : fraction * 0.68);
}

function titleItem(scene: SceneContext, options: { size: number; color: string; maxLines?: number; weight?: number; uppercase?: boolean; delay?: number; family?: string; maxWidth?: number }): ColumnItem | null {
  const raw = scene.settings.text.title || "Название трека";
  const text = options.uppercase ? raw.toUpperCase() : raw;
  const { ctx } = scene;
  const maxWidth = options.maxWidth ?? (scene.isWide ? scene.width * 0.42 : scene.width * 0.84);
  const family = options.family ?? DISPLAY_FONT;
  const weight = options.weight ?? 700;
  ctx.font = `${weight} ${options.size}px ${family}`;
  let lines = wrapLines(ctx, text, maxWidth, options.maxLines ?? 2);
  const widest = lines.reduce((longest, line) => (line.length > longest.length ? line : longest), "");
  const size = fitFontSize(ctx, widest, maxWidth, options.size, weight, family);
  ctx.font = `${weight} ${size}px ${family}`;
  lines = wrapLines(ctx, text, maxWidth, options.maxLines ?? 2);
  const lineHeight = size * 1.04;
  return {
    height: lineHeight * lines.length,
    draw: (left, top, width, align) => {
      lines.forEach((line, index) => {
        drawText(scene, line, anchorX(left, width, align), top + lineHeight * (index + 0.82), {
          size,
          weight,
          family,
          color: options.color,
          align,
          delay: options.delay ?? 0.1,
          letterSpacing: -size * 0.02
        });
      });
    }
  };
}

function lineItem(scene: SceneContext, text: string, options: { size: number; color: string; weight?: number; family?: string; delay?: number; letterSpacing?: number }): ColumnItem | null {
  if (!text) return null;
  return {
    height: options.size * 1.2,
    draw: (left, top, width, align) => {
      const size = fitFontSize(scene.ctx, text, width, options.size, options.weight ?? 500, options.family ?? BODY_FONT);
      drawText(scene, text, anchorX(left, width, align), top + size * 0.95, {
        size,
        weight: options.weight ?? 500,
        family: options.family ?? BODY_FONT,
        color: options.color,
        align,
        delay: options.delay ?? 0.2,
        letterSpacing: options.letterSpacing
      });
    }
  };
}

function pillItem(scene: SceneContext, text: string, options: { size: number; background: string; color: string; border?: string; delay?: number }): ColumnItem | null {
  if (!text) return null;
  return {
    height: options.size * 2.4,
    draw: (left, top, width, align) => {
      drawPill(scene, text, align === "center" ? left + width / 2 : left, top, { ...options, align: align === "center" ? "center" : "left" });
    }
  };
}

function spectrumItem(scene: SceneContext, height: number, color: string): ColumnItem | null {
  if (scene.settings.spectrum === "off") return null;
  return {
    height,
    draw: (left, top, width, align) => {
      const spectrumWidth = align === "center" ? width * 0.7 : width * 0.8;
      drawSpectrum(scene, align === "center" ? left + (width - spectrumWidth) / 2 : left, top, spectrumWidth, height, { color, mirror: true });
    }
  };
}

function ctaItems(scene: SceneContext, size: number, dark = false): ColumnItem[] {
  const { text, showLink, lyrics } = scene.settings;
  // Karaoke takes over the lower part of the frame; the end card still carries the call to action.
  if (lyrics.mode === "karaoke" && lyrics.lines.length && lyrics.position === "bottom") return [];
  const items: Array<ColumnItem | null> = [
    pillItem(scene, text.cta, { size, background: dark ? "#111111" : "#ffffff", color: dark ? "#ffffff" : "#14112e", delay: 0.35 }),
    showLink ? lineItem(scene, text.link, { size: size * 0.82, color: dark ? "rgba(17,17,17,0.7)" : "rgba(255,255,255,0.78)", delay: 0.4 }) : null
  ];
  return items.filter((item): item is ColumnItem => Boolean(item));
}

function compact(items: Array<ColumnItem | null>) {
  return items.filter((item): item is ColumnItem => Boolean(item));
}

function artistOf(scene: SceneContext) {
  return scene.settings.text.artist || "Артист";
}

// ——— Classic ———

const premiere: TemplateDefinition = {
  draw(scene) {
    const { unit, settings, frame } = scene;
    const size = coverSize(scene, 0.62);
    const glow = settings.fx.glow * clamp(frame.audio.bass * 1.2 + scene.drop, 0, 1);
    layoutColumn(
      scene,
      compact([
        pillItem(scene, settings.text.badge, { size: unit * 0.026, background: "rgba(255,255,255,0.14)", color: "#ffffff", border: "rgba(255,255,255,0.3)", delay: 0 }),
        {
          height: size,
          cover: true,
          draw: (left, top, width) => {
            const scaled = size * scene.pulse;
            scene.ctx.save();
            applyHero(scene, left + width / 2, top + size / 2, 1);
            drawCover(scene, left + (width - scaled) / 2, top + (size - scaled) / 2, scaled, { radius: size * 0.06, glow });
            scene.ctx.restore();
          }
        },
        titleItem(scene, { size: unit * 0.085, color: "#ffffff" }),
        lineItem(scene, artistOf(scene), { size: unit * 0.045, color: "rgba(255,255,255,0.8)" }),
        spectrumItem(scene, unit * 0.075, "rgba(255,255,255,0.9)"),
        ...ctaItems(scene, unit * 0.03)
      ]),
      unit * 0.035
    );
  }
};

const vinyl: TemplateDefinition = {
  draw(scene) {
    const { ctx, width, height, unit, frame, isWide } = scene;
    const radius = isWide ? height * 0.38 : width * (isTall(scene) ? 0.43 : 0.24);
    const centerX = isWide ? width * 0.3 : width / 2;
    const centerY = isWide ? height / 2 : height * (isTall(scene) ? 0.4 : 0.3);
    const angle = (frame.time / 2.4) * Math.PI * 2;

    ctx.save();
    applyHero(scene, centerX, centerY, 2);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scene.pulse, scene.pulse);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = unit * 0.08;
    ctx.shadowOffsetY = unit * 0.03;
    ctx.fillStyle = "#0c0c11";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = Math.max(1, unit * 0.0015);
    for (let groove = radius * 0.4; groove < radius * 0.97; groove += radius * 0.028) {
      ctx.beginPath();
      ctx.arc(0, 0, groove, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(angle);
    if ("createConicGradient" in ctx) {
      const sheen = ctx.createConicGradient(0, 0, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.12, "rgba(255,255,255,0.09)");
      sheen.addColorStop(0.25, "rgba(255,255,255,0)");
      sheen.addColorStop(0.62, "rgba(255,255,255,0.07)");
      sheen.addColorStop(0.75, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.36, 0, Math.PI * 2);
    ctx.clip();
    if (scene.assets.cover) drawImageCover(ctx, scene.assets.cover, -radius * 0.36, -radius * 0.36, radius * 0.72, radius * 0.72);
    else {
      ctx.fillStyle = scene.settings.palette[0];
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    ctx.restore();
    ctx.fillStyle = "#0b0b0f";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tonearm, with a slight wobble as if it rides the grooves
    ctx.save();
    ctx.translate(centerX + radius * 1.02, centerY - radius * 0.95);
    ctx.rotate(Math.sin(frame.time * 3.1) * 0.006 + frame.audio.kick * 0.01);
    ctx.translate(-(centerX + radius * 1.02), -(centerY - radius * 0.95));
    ctx.strokeStyle = "rgba(230,230,240,0.85)";
    ctx.lineCap = "round";
    ctx.lineWidth = unit * 0.012;
    ctx.beginPath();
    ctx.moveTo(centerX + radius * 1.02, centerY - radius * 0.95);
    ctx.lineTo(centerX + radius * 0.88, centerY - radius * 0.1);
    ctx.lineTo(centerX + radius * 0.62, centerY + radius * 0.22);
    ctx.stroke();
    ctx.fillStyle = "rgba(230,230,240,0.95)";
    ctx.beginPath();
    ctx.arc(centerX + radius * 1.02, centerY - radius * 0.95, unit * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    const textLeft = isWide ? width * 0.58 : width * 0.08;
    const textWidth = isWide ? width * 0.36 : width * 0.84;
    const baseY = isWide ? height * 0.42 : centerY + radius + unit * (isTall(scene) ? 0.16 : 0.13);
    const titleSize = fitFontSize(ctx, scene.settings.text.title || "Название трека", textWidth, unit * 0.09, 700, DISPLAY_FONT);
    drawText(scene, scene.settings.text.title || "Название трека", textLeft, baseY, { size: titleSize, color: "#ffffff", align: "left", delay: 0.1 });
    drawText(scene, `${artistOf(scene)}${scene.settings.text.badge ? ` · ${scene.settings.text.badge}` : ""}`, textLeft, baseY + unit * 0.065, {
      size: unit * 0.04,
      weight: 500,
      family: BODY_FONT,
      color: "rgba(255,255,255,0.78)",
      align: "left",
      delay: 0.2
    });
    const barTop = baseY + unit * 0.11;
    ctx.save();
    ctx.globalAlpha *= textMotion(scene, 0.3).alpha;
    roundRectPath(ctx, textLeft, barTop, textWidth, unit * 0.012, unit * 0.006);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fill();
    roundRectPath(ctx, textLeft, barTop, textWidth * clamp(frame.time / Math.max(1, frame.clipDuration), 0, 1), unit * 0.012, unit * 0.006);
    ctx.fillStyle = scene.settings.palette[0];
    ctx.fill();
    ctx.restore();
    if (scene.settings.text.cta) {
      drawPill(scene, scene.settings.text.cta, textLeft, barTop + unit * 0.05, { size: unit * 0.028, background: "#ffffff", color: "#14112e", align: "left", delay: 0.35 });
    }
    // In a square the link would collide with the watermark; the end card still shows it.
    if (scene.settings.showLink && scene.settings.text.link && barTop + unit * 0.17 < height * 0.9) {
      drawText(scene, scene.settings.text.link, textLeft, barTop + unit * 0.17, { size: unit * 0.026, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.7)", align: "left", delay: 0.4 });
    }
  }
};

const glass: TemplateDefinition = {
  draw(scene) {
    const { ctx, unit, settings, frame } = scene;
    const size = scene.isWide ? Math.min(scene.height * 0.5, scene.width * 0.3) : scene.width * (isTall(scene) ? 0.56 : 0.36);
    const glow = settings.fx.glow * clamp(frame.audio.bass * 1.2 + scene.drop, 0, 1);
    const padding = unit * 0.06;
    // The card, cover and text drift together as one floating pane.
    const float = idleFloat(scene, 4);
    const coverGrowth = (settings.layout.coverScale - 1) * size;
    const coverShift = settings.layout.coverShiftY * scene.height;
    ctx.save();
    ctx.translate(scene.width / 2 + float.x, scene.height / 2 + float.y);
    ctx.rotate(float.rotation * 0.4);
    ctx.translate(-scene.width / 2, -scene.height / 2);
    layoutColumn(
      scene,
      compact([
        {
          height: size,
          cover: true,
          draw: (left, top, width) => {
            const scaled = size * scene.pulse;
            scene.ctx.save();
            applyHero(scene, left + width / 2, top + size / 2, 1, { float: false });
            drawCover(scene, left + (width - scaled) / 2, top + (size - scaled) / 2, scaled, { radius: size * 0.07, glow });
            scene.ctx.restore();
          }
        },
        titleItem(scene, { size: unit * 0.075, color: "#ffffff", maxWidth: scene.isWide ? scene.width * 0.4 : scene.width * 0.7 }),
        lineItem(scene, artistOf(scene), { size: unit * 0.042, color: "rgba(255,255,255,0.8)" }),
        spectrumItem(scene, unit * 0.06, "rgba(255,255,255,0.9)"),
        ...ctaItems(scene, unit * 0.028)
      ]),
      unit * 0.03,
      {
        inset: 0.15,
        padding,
        backdrop: (laidOut) => {
          // Stretch the card over the user's cover and text offsets so nothing pokes out of it.
          const top = laidOut.y + Math.min(0, coverShift - coverGrowth / 2, scene.textShift);
          const bottom = laidOut.y + laidOut.height + Math.max(0, scene.textShift);
          const grow = Math.max(0, coverGrowth / 2);
          const rect = { x: laidOut.x - grow, y: top, width: laidOut.width + grow * 2, height: bottom - top };
          ctx.save();
          roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, unit * 0.06);
          const fill = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
          fill.addColorStop(0, "rgba(255,255,255,0.2)");
          fill.addColorStop(1, "rgba(255,255,255,0.07)");
          ctx.fillStyle = fill;
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = unit * 0.08;
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.lineWidth = Math.max(1, unit * 0.003);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.stroke();
          // A soft highlight along the top edge sells the glass.
          const sheen = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.height * 0.35);
          sheen.addColorStop(0, "rgba(255,255,255,0.14)");
          sheen.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = sheen;
          ctx.fill();
          ctx.restore();
        }
      }
    );
    ctx.restore();
  }
};

const player: TemplateDefinition = {
  draw(scene) {
    const { ctx, width, height, unit, frame, settings } = scene;
    const phoneHeight = scene.isWide ? height * 0.86 : isTall(scene) ? height * 0.66 : height * 0.7;
    const phoneWidth = phoneHeight / 2.05;
    const centerX = scene.isWide ? width * 0.3 : width / 2;
    const centerY = height * (isTall(scene) ? 0.45 : scene.isWide ? 0.5 : 0.41);
    // A coloured glow behind the phone keeps it readable on dark backgrounds.
    const backGlow = ctx.createRadialGradient(centerX, centerY, phoneWidth * 0.2, centerX, centerY, phoneHeight * 0.7);
    backGlow.addColorStop(0, rgba(settings.palette[0], 0.5 + frame.audio.bass * 0.3));
    backGlow.addColorStop(1, rgba(settings.palette[0], 0));
    ctx.fillStyle = backGlow;
    ctx.fillRect(centerX - phoneHeight, centerY - phoneHeight, phoneHeight * 2, phoneHeight * 2);

    ctx.save();
    applyHero(scene, centerX, centerY, 3);
    ctx.translate(centerX, centerY);
    // The phone sways like it is held in a hand, and nods on the kick.
    const sway = Math.sin(frame.time * 0.7) * 0.06 * settings.motion;
    ctx.rotate((scene.isWide ? -0.05 : -0.07) + sway);
    ctx.scale(1 + frame.audio.kick * settings.fx.bassPulse * 0.03, 1 + frame.audio.kick * settings.fx.bassPulse * 0.03);
    const left = -phoneWidth / 2;
    const top = -phoneHeight / 2;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = unit * 0.1;
    ctx.shadowOffsetY = unit * 0.04;
    roundRectPath(ctx, left, top, phoneWidth, phoneHeight, phoneWidth * 0.14);
    ctx.fillStyle = "#16161c";
    ctx.fill();
    ctx.shadowColor = "transparent";
    // Metal rim light along the body edge.
    const rim = ctx.createLinearGradient(left, top, left + phoneWidth, top + phoneHeight);
    rim.addColorStop(0, "rgba(255,255,255,0.75)");
    rim.addColorStop(0.35, "rgba(255,255,255,0.12)");
    rim.addColorStop(0.65, "rgba(255,255,255,0.1)");
    rim.addColorStop(1, rgba(settings.palette[1], 0.7));
    ctx.lineWidth = Math.max(1.5, phoneWidth * 0.012);
    ctx.strokeStyle = rim;
    ctx.stroke();
    const inset = phoneWidth * 0.035;
    roundRectPath(ctx, left + inset, top + inset, phoneWidth - inset * 2, phoneHeight - inset * 2, phoneWidth * 0.11);
    const screen = ctx.createLinearGradient(0, top, 0, top + phoneHeight);
    screen.addColorStop(0, rgba(settings.palette[0], 0.55));
    screen.addColorStop(1, "#0d0d14");
    ctx.fillStyle = screen;
    ctx.fill();

    const innerWidth = phoneWidth - inset * 2;
    const artSize = innerWidth * 0.82;
    const artX = -artSize / 2;
    const artY = top + phoneHeight * 0.14;
    ctx.font = `600 ${innerWidth * 0.045}px ${BODY_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    ctx.fillText("Сейчас играет", 0, top + phoneHeight * 0.09);
    // Inside the phone the user's text offset must not apply.
    const localScene: SceneContext = { ...scene, unit: innerWidth, textShift: 0 };
    drawCover(localScene, artX, artY, artSize, { radius: artSize * 0.05, glow: settings.fx.glow * frame.audio.bass });
    const textTop = artY + artSize + innerWidth * 0.13;
    const title = settings.text.title || "Название трека";
    const titleSize = fitFontSize(ctx, title, artSize, innerWidth * 0.08, 700, DISPLAY_FONT);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${titleSize}px ${DISPLAY_FONT}`;
    ctx.fillText(title, artX, textTop);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `500 ${innerWidth * 0.05}px ${BODY_FONT}`;
    ctx.fillText(artistOf(scene), artX, textTop + innerWidth * 0.075);
    const barY = textTop + innerWidth * 0.15;
    const progress = clamp(frame.trackTime / Math.max(1, frame.trackDuration), 0, 1);
    roundRectPath(ctx, artX, barY, artSize, innerWidth * 0.012, innerWidth * 0.006);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    roundRectPath(ctx, artX, barY, artSize * progress, innerWidth * 0.012, innerWidth * 0.006);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(artX + artSize * progress, barY + innerWidth * 0.006, innerWidth * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `500 ${innerWidth * 0.038}px ${BODY_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(formatClock(frame.trackTime), artX, barY + innerWidth * 0.065);
    ctx.textAlign = "right";
    ctx.fillText(`-${formatClock(frame.trackDuration - frame.trackTime)}`, artX + artSize, barY + innerWidth * 0.065);
    // Transport controls
    const controlsY = barY + innerWidth * 0.2;
    ctx.fillStyle = "#ffffff";
    const triangle = (x: number, y: number, size: number, direction: 1 | -1) => {
      ctx.beginPath();
      ctx.moveTo(x - (size / 2) * direction, y - size / 2);
      ctx.lineTo(x + (size / 2) * direction, y);
      ctx.lineTo(x - (size / 2) * direction, y + size / 2);
      ctx.closePath();
      ctx.fill();
    };
    const iconSize = innerWidth * 0.07;
    triangle(-innerWidth * 0.26, controlsY, iconSize, -1);
    triangle(-innerWidth * 0.3, controlsY, iconSize, -1);
    ctx.fillRect(-iconSize * 0.55, controlsY - iconSize * 0.6, iconSize * 0.36, iconSize * 1.2);
    ctx.fillRect(iconSize * 0.19, controlsY - iconSize * 0.6, iconSize * 0.36, iconSize * 1.2);
    triangle(innerWidth * 0.26, controlsY, iconSize, 1);
    triangle(innerWidth * 0.3, controlsY, iconSize, 1);
    drawSpectrum(localScene, artX, controlsY + innerWidth * 0.08, artSize, innerWidth * 0.08, { color: "rgba(255,255,255,0.75)", mirror: true });
    // A glass reflection sweeps across the screen every few seconds.
    const sweep = ((frame.time / 4) % 1) * 2 - 0.5;
    const glare = ctx.createLinearGradient(left + phoneWidth * sweep, top, left + phoneWidth * (sweep + 0.4), top + phoneHeight * 0.4);
    glare.addColorStop(0, "rgba(255,255,255,0)");
    glare.addColorStop(0.5, "rgba(255,255,255,0.08)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    roundRectPath(ctx, left + inset, top + inset, phoneWidth - inset * 2, phoneHeight - inset * 2, phoneWidth * 0.11);
    ctx.fillStyle = glare;
    ctx.fill();
    ctx.restore();

    const captionY = scene.isWide ? height * 0.45 : centerY + phoneHeight / 2 + unit * (isTall(scene) ? 0.09 : 0.07);
    const captionX = scene.isWide ? width * 0.6 : width / 2;
    const align = scene.isWide ? "left" : "center";
    drawText(scene, settings.text.cta, captionX, captionY, { size: unit * 0.04, weight: 700, color: "#ffffff", align, delay: 0.3, shadow: true });
    if (settings.showLink) {
      drawText(scene, settings.text.link, captionX, captionY + unit * 0.055, { size: unit * 0.028, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.78)", align, delay: 0.4 });
    }
  }
};

// ——— Design ———

const PAPER = "#f1ece2";
const INK = "#111111";

const headline: TemplateDefinition = {
  keepsOwnBackground: true,
  ownBackground(scene) {
    scene.ctx.fillStyle = PAPER;
    scene.ctx.fillRect(0, 0, scene.width, scene.height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const margin = unit * 0.07;
    const top = isTall(scene) ? height * 0.12 : margin;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = `700 ${unit * 0.026}px ${BODY_FONT}`;
    ctx.textAlign = "left";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${unit * 0.004}px`;
    ctx.fillText("НОВЫЙ СИНГЛ", margin, top);
    ctx.textAlign = "right";
    ctx.fillText((settings.text.badge || "").toUpperCase(), width - margin, top);
    ctx.fillRect(margin, top + unit * 0.02, width - margin * 2, Math.max(2, unit * 0.004));
    ctx.restore();

    const title = (settings.text.title || "Название").toUpperCase();
    const maxWidth = width - margin * 2;
    ctx.font = `700 ${unit * 0.2}px ${DISPLAY_FONT}`;
    const lines = wrapLines(ctx, title, maxWidth, 3);
    const widest = lines.reduce((a, b) => (ctx.measureText(a).width > ctx.measureText(b).width ? a : b), "");
    const size = fitFontSize(ctx, widest, maxWidth, scene.isWide ? unit * 0.22 : unit * 0.2, 700, DISPLAY_FONT);
    let y = top + unit * 0.04 + size * 0.88;
    lines.forEach((line, index) => {
      const drift = Math.sin(frame.time * 0.45 + index * 1.3) * unit * 0.012 * settings.motion;
      drawText(scene, line, margin + drift, y, { size, color: INK, align: "left", delay: 0.05 + index * 0.08, letterSpacing: -size * 0.04 });
      y += size * 0.88;
    });
    const artist = artistOf(scene).toUpperCase();
    const artistSize = fitFontSize(ctx, artist, maxWidth, size * 0.75, 700, DISPLAY_FONT);
    drawText(scene, artist, margin, y, { size: artistSize, stroke: INK, strokeWidth: Math.max(2, unit * 0.004), align: "left", delay: 0.3 });

    const imageSize = scene.isWide ? height * 0.36 : width * 0.42;
    const imageY = height - (isTall(scene) ? height * 0.21 : margin) - imageSize;
    ctx.save();
    applyHero(scene, margin + imageSize / 2, imageY + imageSize / 2, 5);
    drawCover(scene, margin, imageY, imageSize, { radius: 0, filter: "grayscale(1) contrast(1.35)", shadow: false });
    ctx.restore();
    if (settings.text.cta) {
      ctx.save();
      ctx.globalAlpha *= textMotion(scene, 0.4).alpha;
      const label = `${settings.text.cta.toUpperCase()} →`;
      const boxLeft = margin + imageSize + unit * 0.04;
      // The label box and link share whatever room is left beside the photo.
      const room = width - margin - boxLeft;
      const labelSize = fitFontSize(ctx, label, room - unit * 0.05, unit * 0.03, 700, BODY_FONT);
      ctx.font = `700 ${labelSize}px ${BODY_FONT}`;
      const labelWidth = Math.min(room, ctx.measureText(label).width + unit * 0.05);
      ctx.fillStyle = INK;
      ctx.fillRect(boxLeft, imageY + imageSize - unit * 0.07, labelWidth, unit * 0.07);
      ctx.fillStyle = PAPER;
      ctx.textAlign = "left";
      ctx.fillText(label, boxLeft + unit * 0.025, imageY + imageSize - unit * 0.025);
      if (settings.showLink && settings.text.link) {
        ctx.fillStyle = INK;
        ctx.font = `500 ${fitFontSize(ctx, settings.text.link, room, unit * 0.026, 500, BODY_FONT)}px ${BODY_FONT}`;
        ctx.fillText(settings.text.link, boxLeft, imageY + imageSize - unit * 0.1);
      }
      ctx.restore();
    }
    if (settings.fx.flash) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(frame.audio.kick * 0.22, 0, 0.3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
};

const poster: TemplateDefinition = {
  ownBackground(scene) {
    scene.ctx.fillStyle = "#0b0b0d";
    scene.ctx.fillRect(0, 0, scene.width, scene.height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const imageHeight = scene.isWide ? height : height * 0.68;
    const imageWidth = scene.isWide ? width * 0.55 : width;
    const imageX = scene.isWide ? width * 0.45 : 0;
    const imageY = scene.isWide ? 0 : height * 0.2;
    const zoom = 1.08 + frame.time * 0.004 + frame.audio.kick * settings.fx.cameraZoom * 0.03;
    const pan = Math.sin(frame.time * 0.25) * imageWidth * 0.025 * settings.motion;
    ctx.save();
    ctx.beginPath();
    ctx.rect(imageX, imageY, imageWidth, imageHeight);
    ctx.clip();
    applyHero(scene, imageX + imageWidth / 2, imageY + imageHeight / 2, 6, { float: false });
    ctx.translate(imageX + imageWidth / 2 + pan, imageY + imageHeight / 2);
    ctx.scale(zoom, zoom);
    ctx.filter = "grayscale(1) contrast(1.15)";
    if (scene.assets.cover) drawImageCover(ctx, scene.assets.cover, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    ctx.filter = "none";
    ctx.restore();
    const fade = scene.isWide ? ctx.createLinearGradient(imageX, 0, imageX + imageWidth * 0.5, 0) : ctx.createLinearGradient(0, imageY + imageHeight * 0.45, 0, imageY + imageHeight);
    fade.addColorStop(0, scene.isWide ? "rgba(11,11,13,1)" : "rgba(11,11,13,0)");
    fade.addColorStop(1, scene.isWide ? "rgba(11,11,13,0)" : "rgba(11,11,13,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(imageX, imageY, imageWidth, imageHeight);

    const margin = unit * 0.07;
    const textWidth = scene.isWide ? width * 0.45 - margin * 2 : width - margin * 2;
    const title = (settings.text.title || "Трек").toUpperCase();
    const titleSize = fitFontSize(ctx, title, textWidth, unit * 0.16, 700, DISPLAY_FONT);
    const titleY = scene.isWide ? height * 0.42 : height * 0.17;
    drawText(scene, title, margin, titleY, { size: titleSize, color: "#ffffff", align: "left", letterSpacing: titleSize * 0.02, delay: 0.05 });

    const rows: Array<[string, string]> = [
      ["АРТИСТ", artistOf(scene)],
      ["РЕЛИЗ", settings.text.badge || "Новый сингл"],
      ["СЛУШАТЬ", settings.showLink && settings.text.link ? settings.text.link : settings.text.cta]
    ];
    let rowY = scene.isWide ? height * 0.52 : height * 0.74;
    rows.forEach(([label, value], index) => {
      if (!value) return;
      ctx.save();
      ctx.globalAlpha *= textMotion(scene, 0.2 + index * 0.08).alpha;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(margin, rowY, textWidth, Math.max(1, unit * 0.002));
      ctx.font = `600 ${unit * 0.022}px ${BODY_FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "left";
      ctx.fillText(label, margin, rowY + unit * 0.045);
      const valueSize = fitFontSize(ctx, value, textWidth * 0.68, unit * 0.034, 600, BODY_FONT);
      ctx.font = `600 ${valueSize}px ${BODY_FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "right";
      ctx.fillText(value, margin + textWidth, rowY + unit * 0.047);
      ctx.restore();
      rowY += unit * 0.075;
    });
  }
};

/** The brightest accent, lifted toward white until it reads as the light half of a duotone. */
function isGreyPalette(palette: readonly string[]) {
  return palette.slice(0, 3).every((hex) => {
    const [r, g, b] = hexToRgb(hex);
    const max = Math.max(r, g, b);
    return max === 0 || (max - Math.min(r, g, b)) / max < 0.18;
  });
}

/** A black-and-white cover has no colours to split — fall back to the ICM violet-and-pink pair. */
function duotonePair(palette: readonly string[]): [string, string] {
  return isGreyPalette(palette) ? ["#ff8fc7", "#1a1240"] : [duotoneLight(palette), palette[3]];
}

function duotoneLight(palette: readonly string[]) {
  const luminance = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const brightest = palette.slice(0, 3).reduce((best, color) => (luminance(color) > luminance(best) ? color : best), palette[0]);
  const lift = clamp((0.62 - luminance(brightest)) / 0.62, 0, 0.8);
  const [r, g, b] = hexToRgb(brightest);
  const channel = (value: number) => Math.round(value + (255 - value) * lift).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function duotoneCanvas(scene: SceneContext) {
  const [light, darkHex] = duotonePair(scene.settings.palette);
  return cachedCanvas(scene, `duotone:${light}:${darkHex}`, () => {
    if (!scene.assets.cover) return null;
    const canvas = createCanvas(720, 720);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    drawImageCover(context, scene.assets.cover, 0, 0, 720, 720);
    try {
      const image = context.getImageData(0, 0, 720, 720);
      const dark = hexToRgb(darkHex);
      const lightRgb = hexToRgb(light);
      for (let index = 0; index < image.data.length; index += 4) {
        const luminance = (image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114) / 255;
        const value = clamp((luminance - 0.08) * 1.25, 0, 1);
        image.data[index] = dark[0] + (lightRgb[0] - dark[0]) * value;
        image.data[index + 1] = dark[1] + (lightRgb[1] - dark[1]) * value;
        image.data[index + 2] = dark[2] + (lightRgb[2] - dark[2]) * value;
      }
      context.putImageData(image, 0, 0);
    } catch {
      return null;
    }
    return canvas;
  });
}

const duotone: TemplateDefinition = {
  ownBackground(scene) {
    scene.ctx.fillStyle = duotonePair(scene.settings.palette)[1];
    scene.ctx.fillRect(0, 0, scene.width, scene.height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const processed = duotoneCanvas(scene);
    const size = scene.isWide ? height * 0.8 : width * (isTall(scene) ? 0.9 : 0.62);
    const x = scene.isWide ? width * 0.06 : (width - size) / 2;
    const y = scene.isWide ? (height - size) / 2 : isTall(scene) ? height * 0.14 : height * 0.06;
    const zoom = 1.05 + frame.time * 0.006 + (scene.pulse - 1);
    ctx.save();
    applyHero(scene, x + size / 2, y + size / 2, 7);
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(zoom, zoom);
    if (processed) ctx.drawImage(processed, -size / 2, -size / 2, size, size);
    else if (scene.assets.cover) {
      ctx.filter = "grayscale(1)";
      drawImageCover(ctx, scene.assets.cover, -size / 2, -size / 2, size, size);
      ctx.filter = "none";
    }
    ctx.restore();
    const textX = scene.isWide ? width * 0.06 + size + unit * 0.06 : x;
    const textWidth = scene.isWide ? width - textX - unit * 0.08 : size;
    const titleY = scene.isWide ? height * 0.48 : y + size + unit * 0.12;
    const title = (settings.text.title || "Название").toUpperCase();
    const titleSize = fitFontSize(ctx, title, textWidth, unit * 0.12, 700, DISPLAY_FONT);
    drawText(scene, title, textX, titleY, { size: titleSize, color: duotonePair(settings.palette)[0], align: "left", letterSpacing: -titleSize * 0.03 });
    drawText(scene, artistOf(scene), textX, titleY + unit * 0.065, { size: unit * 0.042, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.85)", align: "left", delay: 0.2 });
    if (settings.showLink && settings.text.link) {
      drawText(scene, `${settings.text.cta} → ${settings.text.link}`, textX, titleY + unit * 0.12, { size: unit * 0.026, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.7)", align: "left", delay: 0.35 });
    }
  }
};

function halftoneGrid(scene: SceneContext) {
  return cachedCanvas(scene, "halftone-grid", () => {
    if (!scene.assets.cover) return null;
    const canvas = createCanvas(64, 64);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    drawImageCover(context, scene.assets.cover, 0, 0, 64, 64);
    return canvas;
  });
}

const halftone: TemplateDefinition = {
  keepsOwnBackground: true,
  ownBackground(scene) {
    scene.ctx.fillStyle = PAPER;
    scene.ctx.fillRect(0, 0, scene.width, scene.height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const size = scene.isWide ? height * 0.8 : width * (isTall(scene) ? 0.86 : 0.6);
    const x = scene.isWide ? width * 0.06 : (width - size) / 2;
    const y = scene.isWide ? (height - size) / 2 : isTall(scene) ? height * 0.13 : height * 0.06;
    const grid = halftoneGrid(scene);
    const cells = 64;
    const cell = size / cells;
    let luminance: Uint8ClampedArray | null = null;
    try {
      luminance = grid?.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, cells, cells).data ?? null;
    } catch {
      luminance = null;
    }
    const boost = 1 + frame.audio.bass * 0.35 * settings.fx.bassPulse;
    ctx.save();
    applyHero(scene, x + size / 2, y + size / 2, 8);
    ctx.fillStyle = INK;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const offset = (row * cells + column) * 4;
        const value = luminance
          ? (luminance[offset] * 0.299 + luminance[offset + 1] * 0.587 + luminance[offset + 2] * 0.114) / 255
          : 0.5 + 0.5 * Math.sin(row * 0.3 + column * 0.2);
        // A slow ripple runs through the dots, so the print never sits still.
        const ripple = 1 + Math.sin(row * 0.32 + column * 0.18 - frame.time * 2.2) * 0.22 * settings.motion;
        const radius = (1 - value) * cell * 0.62 * boost * ripple;
        if (radius < 0.4) continue;
        ctx.beginPath();
        ctx.arc(x + column * cell + cell / 2, y + row * cell + cell / 2, Math.min(radius, cell * 0.78), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    const textX = scene.isWide ? x + size + unit * 0.06 : x;
    const textWidth = scene.isWide ? width - textX - unit * 0.08 : size;
    const titleY = scene.isWide ? height * 0.48 : y + size + unit * 0.13;
    const title = (settings.text.title || "Название").toUpperCase();
    const titleSize = fitFontSize(ctx, title, textWidth, unit * 0.12, 700, DISPLAY_FONT);
    drawText(scene, title, textX, titleY, { size: titleSize, color: INK, align: "left", letterSpacing: -titleSize * 0.03 });
    drawText(scene, artistOf(scene), textX, titleY + unit * 0.065, { size: unit * 0.042, weight: 600, family: BODY_FONT, color: INK, align: "left", delay: 0.2 });
    if (settings.showLink && settings.text.link) {
      drawText(scene, settings.text.link, textX, titleY + unit * 0.115, { size: unit * 0.028, weight: 500, family: BODY_FONT, color: "rgba(17,17,17,0.7)", align: "left", delay: 0.35 });
    }
  }
};

const film: TemplateDefinition = {
  ownBackground(scene) {
    scene.ctx.fillStyle = "#15130f";
    scene.ctx.fillRect(0, 0, scene.width, scene.height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const frameWidth = scene.isWide ? height * 0.78 : width * 0.82;
    const frameHeight = frameWidth * 1.25;
    const weaveX = Math.sin(frame.time * 1.7) * unit * 0.003 + (hash(frame.frameIndex) - 0.5) * unit * 0.002;
    const weaveY = Math.cos(frame.time * 1.3) * unit * 0.003;
    const x = (scene.isWide ? width * 0.08 : (width - frameWidth) / 2) + weaveX;
    const y = (scene.isWide ? (height - frameHeight * 0.8) / 2 : isTall(scene) ? height * 0.14 : height * 0.05) + weaveY;
    const shownHeight = scene.isWide ? frameHeight * 0.8 : isTall(scene) ? frameHeight : height * 0.68;
    ctx.save();
    applyHero(scene, x + frameWidth / 2, y + shownHeight / 2, 9);
    // Sprocket strips
    ctx.fillStyle = "#0c0b09";
    ctx.fillRect(x - unit * 0.06, y - unit * 0.03, frameWidth + unit * 0.12, shownHeight + unit * 0.06);
    ctx.fillStyle = "#2a261f";
    for (let hole = y; hole < y + shownHeight; hole += unit * 0.05) {
      roundRectPath(ctx, x - unit * 0.045, hole, unit * 0.025, unit * 0.03, unit * 0.005);
      ctx.fill();
      roundRectPath(ctx, x + frameWidth + unit * 0.02, hole, unit * 0.025, unit * 0.03, unit * 0.005);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, frameWidth, shownHeight);
    ctx.clip();
    ctx.filter = "sepia(0.35) contrast(1.12) saturate(0.9)";
    const zoom = scene.pulse;
    ctx.translate(x + frameWidth / 2, y + shownHeight / 2);
    ctx.scale(zoom, zoom);
    if (scene.assets.cover) drawImageCover(ctx, scene.assets.cover, -frameWidth / 2, -shownHeight / 2, frameWidth, shownHeight);
    ctx.filter = "none";
    ctx.restore();
    // Light leak on the drop
    if (scene.drop > 0) {
      const leak = ctx.createRadialGradient(x + frameWidth, y, 0, x + frameWidth, y, frameWidth);
      leak.addColorStop(0, `rgba(255,140,60,${0.5 * scene.drop})`);
      leak.addColorStop(1, "rgba(255,140,60,0)");
      ctx.fillStyle = leak;
      ctx.fillRect(x, y, frameWidth, shownHeight);
    }
    // Projector flicker.
    ctx.fillStyle = `rgba(255,240,210,${(hash(frame.frameIndex * 3) * 0.05 + 0.01) * settings.motion})`;
    ctx.fillRect(x, y, frameWidth, shownHeight);
    ctx.restore();
    const captionX = scene.isWide ? x + frameWidth + unit * 0.12 : x;
    const captionY = scene.isWide ? height * 0.46 : y + shownHeight + unit * 0.1;
    const caption = `▶ ${artistOf(scene).toUpperCase()} — ${(settings.text.title || "ТРЕК").toUpperCase()}`;
    const captionSize = fitFontSize(ctx, caption, scene.isWide ? width * 0.4 : frameWidth, unit * 0.034, 600, MONO_FONT);
    drawText(scene, caption, captionX, captionY, { size: captionSize, weight: 600, family: MONO_FONT, color: "#f1e7cf", align: "left" });
    drawText(scene, `${formatClock(frame.trackTime)}  ${settings.showLink ? settings.text.link : settings.text.cta}`, captionX, captionY + unit * 0.05, {
      size: unit * 0.024,
      weight: 500,
      family: MONO_FONT,
      color: "rgba(241,231,207,0.65)",
      align: "left",
      delay: 0.25
    });
  }
};

// ——— Audio-reactive ———

const glitch: TemplateDefinition = {
  keepsOwnBackground: true,
  ownBackground(scene) {
    const { ctx, width, height, settings, frame } = scene;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, width, height);
    if (!scene.assets.cover) return;
    // Short glitch bursts also fire on their own every second or so, not only on kicks.
    const idleBurst = hash(Math.floor(frame.time * 1.7) + 0.5) > 0.62 && (frame.time * 1.7) % 1 < 0.35 ? 0.7 * settings.motion : 0;
    const strength = clamp(frame.audio.kick * (settings.fx.kickGlitch ? 1.3 : 0.8) + scene.drop + idleBurst, 0, 1.4);
    ctx.save();
    applyHero(scene, width / 2, height / 2, 10, { float: false });
    const zoom = 1.06 + Math.sin(frame.time * 0.3) * 0.03 * settings.motion;
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    ctx.filter = "contrast(1.35) saturate(1.5)";
    drawImageCover(ctx, scene.assets.cover, 0, 0, width, height);
    ctx.filter = "none";
    ctx.restore();
    if (strength > 0.12) {
      const slices = 9;
      for (let slice = 0; slice < slices; slice += 1) {
        const seed = slice * 7 + Math.floor(frame.frameIndex / 2) * 13;
        if (hash(seed) > 0.55) continue;
        const sliceY = hash(seed + 1) * height;
        const sliceHeight = height * (0.02 + hash(seed + 2) * 0.08);
        const shift = (hash(seed + 3) - 0.5) * width * 0.12 * strength;
        ctx.drawImage(ctx.canvas, 0, sliceY, width, sliceHeight, shift, sliceY, width, sliceHeight);
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(34,211,238,${0.18 * strength})`;
      ctx.fillRect(0, hash(frame.frameIndex) * height, width, height * 0.06);
      ctx.restore();
    }
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    for (let line = 0; line < height; line += 6) ctx.fillRect(0, line, width, 2);
    const shade = ctx.createLinearGradient(0, height * 0.45, 0, height);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const margin = unit * 0.08;
    const baseY = isTall(scene) ? height * 0.7 : height * 0.74;
    const title = (settings.text.title || "Название").toUpperCase();
    const size = fitFontSize(ctx, title, width - margin * 2, unit * 0.14, 700, DISPLAY_FONT);
    const split = (frame.audio.kick * (settings.fx.kickGlitch ? 1.4 : 0.8) + scene.drop) * unit * 0.012;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    drawText(scene, title, margin - split, baseY, { size, color: "#ff3d81", align: "left" });
    drawText(scene, title, margin + split, baseY, { size, color: "#22d3ee", align: "left" });
    ctx.restore();
    drawText(scene, title, margin, baseY, { size, color: "#ffffff", align: "left" });
    drawText(scene, `> ${artistOf(scene).toLowerCase()} // ${formatClock(frame.trackTime)}`, margin, baseY + unit * 0.06, {
      size: unit * 0.032,
      weight: 600,
      family: MONO_FONT,
      color: "#7df0c4",
      align: "left",
      delay: 0.2
    });
    if (settings.showLink && settings.text.link) {
      drawText(scene, `> ${settings.text.link}`, margin, baseY + unit * 0.105, { size: unit * 0.026, weight: 500, family: MONO_FONT, color: "rgba(255,255,255,0.75)", align: "left", delay: 0.3 });
    }
  }
};

const orb: TemplateDefinition = {
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const radius = (scene.isWide ? height * 0.27 : width * (isTall(scene) ? 0.3 : 0.19)) * scene.pulse;
    const centerX = scene.isWide ? width * 0.3 : width / 2;
    const centerY = scene.isWide ? height / 2 : height * (isTall(scene) ? 0.4 : 0.35);
    const [accent, second] = settings.palette;
    ctx.save();
    applyHero(scene, centerX, centerY, 11);
    // Halo
    const halo = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 2.2);
    halo.addColorStop(0, rgba(accent, 0.45 + frame.audio.bass * 0.4));
    halo.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(centerX - radius * 2.3, centerY - radius * 2.3, radius * 4.6, radius * 4.6);
    // Circular spectrum
    if (settings.spectrum !== "off") {
      const bands = frame.audio.spectrum;
      const count = bands.length * 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(frame.time * 0.15);
      ctx.strokeStyle = rgba(second, 0.9);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2, unit * 0.007);
      for (let index = 0; index < count; index += 1) {
        const band = Math.abs(index - bands.length + 0.5) - 0.5;
        const value = Math.pow(clamp(bands[Math.round(band)] ?? 0, 0, 1), 1.3);
        const angle = (index / count) * Math.PI * 2;
        const inner = radius * 1.12;
        const outer = inner + unit * (0.015 + value * 0.12);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Ring + cover
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = unit * (0.04 + settings.fx.glow * frame.audio.bass * 0.1);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = unit * 0.01;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 1.04, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    if (scene.assets.cover) drawImageCover(ctx, scene.assets.cover, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();
    ctx.restore();

    const textX = scene.isWide ? width * 0.58 : width / 2;
    const align = scene.isWide ? "left" : "center";
    const textWidth = scene.isWide ? width * 0.36 : width * 0.84;
    const titleY = scene.isWide ? height * 0.46 : centerY + radius * 1.6 + unit * 0.08;
    const title = settings.text.title || "Название трека";
    const titleSize = fitFontSize(ctx, title, textWidth, unit * 0.08, 700, DISPLAY_FONT);
    drawText(scene, title, textX, titleY, { size: titleSize, color: "#ffffff", align, shadow: true });
    drawText(scene, artistOf(scene), textX, titleY + unit * 0.06, { size: unit * 0.042, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.8)", align, delay: 0.2 });
    if (settings.showLink && settings.text.link) {
      drawText(scene, settings.text.link, textX, titleY + unit * 0.11, { size: unit * 0.028, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.7)", align, delay: 0.35 });
    }
  }
};

const echo: TemplateDefinition = {
  ownBackground(scene) {
    const { ctx, width, height } = scene;
    ctx.fillStyle = "#c4161c";
    ctx.fillRect(0, 0, width, height);
  },
  draw(scene) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const word = (settings.text.title || "Название").toUpperCase();
    const margin = unit * 0.06;
    // The stack fills a fixed band so the artist line below always has clear space.
    const bandTop = isTall(scene) ? height * 0.12 : height * 0.04;
    const bandBottom = isTall(scene) ? height * 0.74 : height * 0.76;
    const size = fitFontSize(ctx, word, width - margin * 2, unit * 0.2, 700, DISPLAY_FONT);
    const lineHeight = size * 0.86;
    const lines = Math.max(3, Math.floor((bandBottom - bandTop) / lineHeight));
    const startY = bandTop + (bandBottom - bandTop - lineHeight * lines) / 2 + lineHeight * 0.85;
    const highlighted = Math.floor(frame.time * 2) % lines;
    for (let line = 0; line < lines; line += 1) {
      const sway = Math.sin(frame.time * 1.5 + line * 0.7) * unit * 0.02 * (1 + frame.audio.kick);
      const isActive = line === highlighted;
      drawText(scene, word, width / 2 + sway, startY + line * lineHeight, {
        size,
        align: "center",
        color: isActive ? "#ffffff" : undefined,
        stroke: isActive ? undefined : "rgba(255,255,255,0.85)",
        strokeWidth: Math.max(2, unit * 0.004),
        delay: line * 0.04,
        letterSpacing: size * 0.02
      });
    }
    const radius = unit * (scene.isWide ? 0.17 : 0.19) * scene.pulse;
    const circleY = (bandTop + bandBottom) / 2;
    ctx.save();
    applyHero(scene, width / 2, circleY, 12);
    ctx.beginPath();
    ctx.arc(width / 2, circleY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.filter = "grayscale(1) contrast(1.3)";
    if (scene.assets.cover) drawImageCover(ctx, scene.assets.cover, width / 2 - radius, circleY - radius, radius * 2, radius * 2);
    ctx.filter = "none";
    ctx.restore();
    const footer = bandBottom + unit * 0.07;
    drawText(scene, artistOf(scene).toUpperCase(), width / 2, footer, { size: unit * 0.045, weight: 700, color: "#ffffff", align: "center", delay: 0.3, letterSpacing: unit * 0.006 });
    if (settings.showLink && settings.text.link) {
      drawText(scene, settings.text.link, width / 2, footer + unit * 0.05, { size: unit * 0.026, weight: 500, family: BODY_FONT, color: "rgba(255,255,255,0.8)", align: "center", delay: 0.4 });
    }
  }
};

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  premiere,
  vinyl,
  glass,
  player,
  headline,
  poster,
  duotone,
  halftone,
  film,
  glitch,
  orb,
  echo
};
