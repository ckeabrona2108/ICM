import { clamp, createCanvas, drawCoverPlaceholder, drawImageCover, hash, mix, rgba, type SceneContext } from "./draw-utils";

const SPEED = [0.55, 1, 1.8] as const;

/**
 * Live backgrounds are painted on a tiny canvas and scaled up: the upscale is
 * the blur. That keeps a 1080×1920 frame cheap enough for real-time preview and
 * makes the offline export identical to it.
 */
export class BackgroundPainter {
  private small: HTMLCanvasElement | null = null;
  private medium: HTMLCanvasElement | null = null;
  private grain: HTMLCanvasElement | null = null;

  paint(scene: SceneContext) {
    const { ctx, width, height, settings } = scene;
    const divisor = 10 + settings.backgroundBlur * 18;
    const smallWidth = Math.max(16, Math.round(width / divisor));
    const smallHeight = Math.max(16, Math.round(height / divisor));
    if (!this.small || this.small.width !== smallWidth || this.small.height !== smallHeight) {
      this.small = createCanvas(smallWidth, smallHeight);
      this.medium = createCanvas(smallWidth * 4, smallHeight * 4);
    }
    const small = this.small.getContext("2d");
    const medium = this.medium?.getContext("2d");
    if (!small || !medium || !this.medium) return;

    small.save();
    small.clearRect(0, 0, smallWidth, smallHeight);
    paintLayer(scene, small, smallWidth, smallHeight);
    small.restore();

    // Two-step upscale gives smooth gradients without blocky edges.
    medium.imageSmoothingEnabled = true;
    medium.imageSmoothingQuality = "high";
    medium.clearRect(0, 0, this.medium.width, this.medium.height);
    medium.drawImage(this.small, 0, 0, this.medium.width, this.medium.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.medium, 0, 0, width, height);
    ctx.restore();
  }

  paintGrain(scene: SceneContext, strength = 0.07) {
    const { ctx, width, height, frame } = scene;
    if (!this.grain) {
      this.grain = createCanvas(256, 256);
      const grainContext = this.grain.getContext("2d");
      if (grainContext) {
        const image = grainContext.createImageData(256, 256);
        for (let index = 0; index < image.data.length; index += 4) {
          const value = Math.floor(hash(index * 0.37) * 255);
          image.data[index] = value;
          image.data[index + 1] = value;
          image.data[index + 2] = value;
          image.data[index + 3] = 255;
        }
        grainContext.putImageData(image, 0, 0);
      }
    }
    const pattern = ctx.createPattern(this.grain, "repeat");
    if (!pattern) return;
    const offsetX = Math.floor(hash(frame.frameIndex) * 256);
    const offsetY = Math.floor(hash(frame.frameIndex + 7) * 256);
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = "overlay";
    ctx.translate(-offsetX, -offsetY);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width + 256, height + 256);
    ctx.restore();
  }
}

function blob(small: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 0.95) {
  const gradient = small.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.55, rgba(color, alpha * 0.45));
  gradient.addColorStop(1, rgba(color, 0));
  small.fillStyle = gradient;
  small.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function paintLayer(scene: SceneContext, small: CanvasRenderingContext2D, width: number, height: number) {
  const { settings, frame, assets } = scene;
  const [accentA, accentB, accentC, base] = settings.palette;
  const time = frame.time * SPEED[settings.backgroundSpeed] + 3.7;
  const beat = settings.backgroundBeat ? frame.audio.kick : 0;
  const size = Math.max(width, height);

  const fillBase = (color: string) => {
    small.fillStyle = color;
    small.fillRect(0, 0, width, height);
  };
  const drawCoverLayer = (scale: number, rotation: number, filter: string) => {
    small.save();
    small.translate(width / 2, height / 2);
    small.rotate(rotation);
    small.scale(scale, scale);
    small.filter = filter;
    if (assets.cover) drawImageCover(small, assets.cover, -width / 2, -height / 2, width, height);
    else drawCoverPlaceholder(small, settings.palette, -width / 2, -height / 2, width, height);
    small.restore();
  };

  // "auto" on a template without a backdrop of its own means the house default.
  switch (settings.background === "auto" ? "lava" : settings.background) {
    case "solid": {
      fillBase(base);
      blob(small, width * 0.5, height * 0.38, size * 0.7, mix(base, accentA, 0.35), 0.8);
      break;
    }
    case "cover-blur": {
      fillBase(base);
      drawCoverLayer(1.18 + Math.sin(time * 0.3) * 0.04 + beat * 0.05, 0, "blur(1.5px) saturate(1.25)");
      small.fillStyle = "rgba(6,8,18,0.38)";
      small.fillRect(0, 0, width, height);
      break;
    }
    case "haze": {
      fillBase(base);
      drawCoverLayer(1.45 + Math.sin(time * 0.12) * 0.12 + beat * 0.06, Math.sin(time * 0.05) * 0.14, "blur(2.5px) saturate(1.45)");
      small.fillStyle = "rgba(6,8,18,0.25)";
      small.fillRect(0, 0, width, height);
      break;
    }
    case "liquid": {
      fillBase(base);
      drawCoverLayer(1.5 + beat * 0.05, Math.sin(time * 0.04) * 0.1, `blur(2.5px) saturate(1.6) hue-rotate(${(time * 18) % 360}deg)`);
      small.globalCompositeOperation = "screen";
      blob(small, width * (0.4 + Math.sin(time * 0.2) * 0.2), height * (0.35 + Math.cos(time * 0.17) * 0.2), size * 0.4, "#ffffff", 0.22);
      small.globalCompositeOperation = "source-over";
      small.fillStyle = "rgba(6,8,18,0.22)";
      small.fillRect(0, 0, width, height);
      break;
    }
    case "lava": {
      fillBase(base);
      small.globalCompositeOperation = "screen";
      const grow = 1 + beat * 0.18;
      blob(small, width * (0.28 + Math.sin(time * 0.21) * 0.24), height * (0.28 + Math.cos(time * 0.17) * 0.18), size * 0.5 * grow, accentB);
      blob(small, width * (0.7 + Math.sin(time * 0.16 + 2) * 0.22), height * (0.58 + Math.sin(time * 0.13 + 1) * 0.22), size * 0.58 * grow, accentA);
      blob(small, width * (0.35 + Math.cos(time * 0.19 + 4) * 0.22), height * (0.82 + Math.sin(time * 0.23) * 0.14), size * 0.46 * grow, accentC);
      small.globalCompositeOperation = "source-over";
      break;
    }
    case "mesh": {
      fillBase(base);
      small.globalCompositeOperation = "screen";
      const corners: Array<[number, number, string]> = [
        [0, 0, accentA],
        [1, 0, accentB],
        [0, 1, accentC],
        [1, 1, mix(base, accentA, 0.6)]
      ];
      corners.forEach(([cornerX, cornerY, color], index) => {
        const angle = time * 0.15 + (index * Math.PI) / 2;
        blob(
          small,
          width * (cornerX + (0.5 - cornerX) * 0.35 + Math.cos(angle) * 0.22),
          height * (cornerY + (0.5 - cornerY) * 0.35 + Math.sin(angle) * 0.22),
          size * 0.62 * (1 + beat * 0.12),
          color
        );
      });
      small.globalCompositeOperation = "source-over";
      break;
    }
    case "aurora": {
      fillBase(mix(base, "#000000", 0.4));
      small.globalCompositeOperation = "screen";
      const ribbons: Array<[number, number, string, string]> = [
        [0.3, 12, accentC, accentA],
        [0.52, 15, accentB, accentA],
        [0.74, 18, accentC, accentB]
      ];
      ribbons.forEach(([centerY, period, colorA, colorB], index) => {
        const gradient = small.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, rgba(colorA, 0));
        gradient.addColorStop(0.3, rgba(colorA, 0.85));
        gradient.addColorStop(0.7, rgba(colorB, 0.85));
        gradient.addColorStop(1, rgba(colorB, 0));
        small.strokeStyle = gradient;
        small.lineWidth = height * (0.1 + 0.04 * Math.sin(time * 0.4 + index) + beat * 0.04);
        small.lineCap = "round";
        small.beginPath();
        for (let step = -2; step <= width + 2; step += 1) {
          const wave = Math.sin(step / width * Math.PI * 2 + (time * Math.PI * 2) / period + index * 1.7) * height * 0.07;
          const pointY = height * centerY + wave + Math.sin(time * 0.3 + index) * height * 0.03;
          if (step === -2) small.moveTo(step, pointY);
          else small.lineTo(step, pointY);
        }
        small.stroke();
      });
      small.globalCompositeOperation = "source-over";
      break;
    }
    case "bokeh": {
      fillBase(mix(base, "#000000", 0.35));
      blob(small, width * 0.5, height * 0.5, size * 0.6, mix(base, accentA, 0.4), 0.6);
      small.globalCompositeOperation = "screen";
      const colors = [accentA, accentB, accentC];
      for (let index = 0; index < 14; index += 1) {
        const speed = 0.025 + hash(index + 1) * 0.04;
        const progress = (hash(index + 31) + time * speed) % 1;
        const pointX = width * hash(index + 11);
        const pointY = height * (1.1 - progress * 1.3);
        const fade = Math.sin(progress * Math.PI);
        const radius = size * (0.03 + hash(index + 5) * 0.05) * (1 + beat * 0.25);
        small.fillStyle = rgba(colors[index % 3], 0.75 * fade);
        small.beginPath();
        small.arc(pointX, pointY, radius, 0, Math.PI * 2);
        small.fill();
      }
      small.globalCompositeOperation = "source-over";
      break;
    }
    case "nebula": {
      fillBase(mix(base, "#000000", 0.5));
      const centerX = width * 0.5;
      const centerY = height * 0.45;
      if ("createConicGradient" in small) {
        const conic = small.createConicGradient(time * 0.08, centerX, centerY);
        [accentA, accentB, base, accentC, accentA].forEach((color, index, list) => conic.addColorStop(index / (list.length - 1), color));
        small.globalAlpha = 0.85;
        small.fillStyle = conic;
        small.beginPath();
        small.arc(centerX, centerY, size * (0.75 + beat * 0.05), 0, Math.PI * 2);
        small.fill();
        small.globalAlpha = 1;
      }
      const fade = small.createRadialGradient(centerX, centerY, size * 0.1, centerX, centerY, size * 0.8);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.75)");
      small.fillStyle = fade;
      small.fillRect(0, 0, width, height);
      break;
    }
    case "pulse": {
      fillBase(base);
      small.globalCompositeOperation = "screen";
      const grow = 1 + clamp(frame.audio.kick, 0, 1) * 0.45;
      blob(small, width * 0.22, height * 0.22, size * 0.42 * grow, accentA);
      blob(small, width * 0.78, height * 0.55, size * 0.42 * grow, accentB);
      blob(small, width * 0.3, height * 0.85, size * 0.36 * grow, accentC);
      small.globalCompositeOperation = "source-over";
      break;
    }
  }
}
