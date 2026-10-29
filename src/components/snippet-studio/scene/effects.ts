import { clamp, hash, rgba, type SceneContext, smoothstep } from "./draw-utils";

/** Where the eye goes: the cover sits here in most templates, so glints and flares aim at it. */
function focalPoint(scene: SceneContext) {
  if (scene.isWide) return { x: scene.width * 0.3, y: scene.height * 0.5 };
  return { x: scene.width * 0.5, y: scene.height * (scene.height > scene.width * 1.4 ? 0.38 : 0.36) };
}

/** Soft dust drifting upward; it brightens and swells a little with the bass. */
export function drawParticles(scene: SceneContext) {
  const { ctx, width, height, unit, frame, settings } = scene;
  const count = 42;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < count; index += 1) {
    const speed = 0.012 + hash(index + 101) * 0.03;
    const progress = (hash(index + 7) + frame.time * speed) % 1;
    const x = width * hash(index + 55) + Math.sin(frame.time * 0.6 + index) * unit * 0.015;
    const y = height * (1.05 - progress * 1.1);
    const fade = Math.sin(progress * Math.PI);
    const twinkle = 0.55 + 0.45 * Math.sin(frame.time * (1.5 + hash(index) * 2) + index * 1.7);
    const radius = unit * (0.002 + hash(index + 3) * 0.004) * (1 + frame.audio.bass * 0.6);
    const color = index % 4 === 0 ? settings.palette[2] : "#ffffff";
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
    glow.addColorStop(0, rgba(color, 0.75 * fade * twinkle * (0.6 + frame.audio.energy * 0.6)));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
  }
  ctx.restore();
}

/** Four-point star glints around the cover, popping on each kick. */
export function drawSparkles(scene: SceneContext) {
  const { ctx, unit, frame } = scene;
  const strength = Math.pow(clamp(frame.audio.kick * 1.15 + scene.drop * 0.6, 0, 1), 1.4);
  if (strength < 0.04) return;
  const center = focalPoint(scene);
  const bucket = Math.floor(frame.time * 2.5);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < 9; index += 1) {
    const seed = bucket * 31 + index * 7;
    const angle = hash(seed) * Math.PI * 2;
    const distance = unit * (0.22 + hash(seed + 1) * 0.2);
    const x = center.x + Math.cos(angle) * distance;
    const y = center.y + Math.sin(angle) * distance;
    const size = unit * (0.018 + hash(seed + 2) * 0.03) * strength;
    ctx.globalAlpha = strength * (0.6 + hash(seed + 3) * 0.4);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
    const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6);
    halo.addColorStop(0, "rgba(255,255,255,0.6)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2);
  }
  ctx.restore();
}

/** A warm band of light drifting across the frame; it flares on the drop. */
export function drawLightLeak(scene: SceneContext) {
  const { ctx, width, height, unit, frame } = scene;
  const sweep = (frame.time / 7) % 1;
  const x = -width * 0.3 + sweep * width * 1.6;
  const y = height * (0.25 + Math.sin(frame.time * 0.3) * 0.1);
  const radius = Math.max(width, height) * 0.55;
  const intensity = 0.22 + scene.drop * 0.45 + frame.audio.bass * 0.08;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const warm = ctx.createRadialGradient(x, y, 0, x, y, radius);
  warm.addColorStop(0, `rgba(255,170,90,${intensity})`);
  warm.addColorStop(0.45, `rgba(255,90,120,${intensity * 0.45})`);
  warm.addColorStop(1, "rgba(255,90,120,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, width, height);
  if (scene.drop > 0.05) {
    const center = focalPoint(scene);
    const flare = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, unit * 0.6);
    flare.addColorStop(0, `rgba(255,255,255,${scene.drop * 0.35})`);
    flare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = flare;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

/** Cinema bars that slide in over the first second. */
export function drawLetterbox(scene: SceneContext) {
  const { ctx, width, height, frame } = scene;
  const amount = frame.still ? 1 : smoothstep(0, 1, frame.time);
  const bar = height * (scene.isWide ? 0.1 : 0.06) * amount;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}

/** Fade up from black over the first half-second, so every clip starts smoothly. */
export function drawIntroFade(scene: SceneContext) {
  if (scene.frame.still) return;
  const alpha = 1 - smoothstep(0, 0.45, scene.frame.time);
  if (alpha <= 0) return;
  scene.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  scene.ctx.fillRect(0, 0, scene.width, scene.height);
}
