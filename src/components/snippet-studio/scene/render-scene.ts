import { AudioFeatureTracker } from "./audio-features";
import { BackgroundPainter } from "./backgrounds";
import { drawIntroFade, drawLetterbox, drawLightLeak, drawParticles, drawSparkles } from "./effects";
import { drawBackgroundLyrics, drawKaraoke } from "./lyrics";
import { BODY_FONT, clamp, DISPLAY_FONT, drawCover, fitFontSize, hash, type SceneContext, smoothstep } from "./draw-utils";
import { TEMPLATES } from "./templates";
import type { SceneAssets, SceneFrame, SceneSettings } from "./types";

export interface SceneRenderInput {
  /** Seconds since the clip start. */
  time: number;
  clipDuration: number;
  trackTime: number;
  trackDuration: number;
  /** Drop moment in clip seconds, or null. */
  dropTime: number | null;
  frequencyData: Uint8Array | null;
  still?: boolean;
  /** Looping clip (Canvas): no fade from black and no end card, so the seam stays invisible. */
  loop?: boolean;
}

const END_CARD_SECONDS = 2.2;

/**
 * One renderer per canvas: it keeps the audio smoothing and caches between
 * frames. Preview and export each create their own, fed the same inputs.
 */
export class SceneRenderer {
  private features = new AudioFeatureTracker();
  private background = new BackgroundPainter();
  private cache = new Map<string, HTMLCanvasElement>();
  private lastTime: number | null = null;
  private frameIndex = 0;

  reset() {
    this.features.reset();
    this.lastTime = null;
    this.frameIndex = 0;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, settings: SceneSettings, input: SceneRenderInput, assets: SceneAssets) {
    const dt = this.lastTime !== null && input.time > this.lastTime && input.time - this.lastTime < 0.25 ? input.time - this.lastTime : 1 / 30;
    this.lastTime = input.time;
    this.frameIndex += 1;
    const audio = this.features.update(input.frequencyData, dt);
    const frame: SceneFrame = {
      time: input.time,
      clipDuration: input.clipDuration,
      trackTime: input.trackTime,
      trackDuration: input.trackDuration,
      dropTime: input.dropTime,
      frameIndex: this.frameIndex,
      still: Boolean(input.still),
      audio
    };

    const sinceDrop = frame.dropTime === null ? -1 : frame.time - frame.dropTime;
    const drop = settings.fx.dropHit && sinceDrop >= 0 && sinceDrop < 1.4 ? Math.exp(-sinceDrop * 3.2) : 0;
    const unit = Math.min(width, height);
    const scene: SceneContext = {
      ctx,
      width,
      height,
      unit,
      isWide: width > height * 1.2,
      settings,
      frame,
      assets,
      drop,
      pulse: 1 + settings.fx.bassPulse * (audio.bass * 0.07 + audio.kick * 0.05) + drop * 0.06,
      textShift: settings.layout.textShiftY * height,
      cache: this.cache
    };
    const template = TEMPLATES[settings.template] ?? TEMPLATES.premiere;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Camera: push-in on kicks and the drop, optional shake. Scaled ≥1 so edges never show.
    const zoom = 1 + settings.fx.cameraZoom * audio.kick * 0.025 + drop * 0.045 + (settings.fx.shake ? 0.02 : 0);
    const shakePower = settings.fx.shake ? (audio.kick * 0.6 + drop) * unit * 0.01 : 0;
    ctx.translate(width / 2 + (hash(this.frameIndex) - 0.5) * shakePower, height / 2 + (hash(this.frameIndex + 3) - 0.5) * shakePower);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    const useOwnBackground = template.ownBackground && (template.keepsOwnBackground || settings.background === "auto");
    if (template.ownBackground && useOwnBackground) {
      template.ownBackground(scene);
    } else {
      this.background.paint(scene);
      const scrim = ctx.createLinearGradient(0, 0, 0, height);
      scrim.addColorStop(0, "rgba(6,8,18,0.22)");
      scrim.addColorStop(0.5, "rgba(6,8,18,0.05)");
      scrim.addColorStop(1, "rgba(6,8,18,0.5)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, width, height);
    }
    if (settings.lyrics.mode === "background") drawBackgroundLyrics(scene);
    template.draw(scene);
    if (settings.lyrics.mode === "karaoke") drawKaraoke(scene);
    if (settings.fx.particles) drawParticles(scene);
    if (settings.fx.sparkles) drawSparkles(scene);
    if (settings.fx.lightLeak) drawLightLeak(scene);
    ctx.restore();

    if (settings.grain || settings.template === "film") this.background.paintGrain(scene, settings.template === "film" ? 0.12 : 0.06);

    const vignette = ctx.createRadialGradient(width / 2, height / 2, unit * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (settings.fx.flash) {
      const flash = clamp(drop * 0.32 + audio.kick * 0.04, 0, 0.4);
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    if (settings.fx.letterbox) drawLetterbox(scene);
    if (settings.endCard && frame.clipDuration >= 8 && !frame.still && !input.loop) this.drawEndCard(scene);
    if (settings.watermark) this.drawWatermark(scene);
    if (!input.loop) drawIntroFade(scene);
  }

  private drawEndCard(scene: SceneContext) {
    const { ctx, width, height, unit, settings, frame } = scene;
    const start = frame.clipDuration - END_CARD_SECONDS;
    const alpha = smoothstep(start, start + 0.5, frame.time);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(6,8,18,0.82)";
    ctx.fillRect(0, 0, width, height);
    const size = unit * 0.38;
    const top = height / 2 - size * 0.85;
    drawCover({ ...scene, frame: { ...frame, still: true } }, (width - size) / 2, top, size, { radius: size * 0.06 });
    const title = settings.text.title || "Название трека";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    const titleSize = fitFontSize(ctx, title, width * 0.84, unit * 0.07, 700, DISPLAY_FONT);
    ctx.font = `700 ${titleSize}px ${DISPLAY_FONT}`;
    ctx.fillText(title, width / 2, top + size + unit * 0.1);
    ctx.font = `500 ${unit * 0.04}px ${BODY_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(settings.text.artist || "", width / 2, top + size + unit * 0.16);
    ctx.font = `700 ${unit * 0.04}px ${DISPLAY_FONT}`;
    ctx.fillStyle = settings.palette[2];
    ctx.fillText(settings.text.cta, width / 2, top + size + unit * 0.25);
    if (settings.showLink && settings.text.link) {
      ctx.font = `600 ${unit * 0.034}px ${BODY_FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(settings.text.link, width / 2, top + size + unit * 0.31);
    }
    ctx.restore();
  }

  private drawWatermark(scene: SceneContext) {
    const { ctx, width, height, unit } = scene;
    ctx.save();
    ctx.font = `600 ${unit * 0.022}px ${BODY_FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("ICECREAMMUSIC", width / 2, height - unit * 0.04);
    ctx.restore();
  }
}
