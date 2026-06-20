"use client";

import * as React from "react";

import { getVideoSnippetCompositionSize, type VideoSnippetFormat } from "@/lib/video-snippets";

export function useCanvasRenderer(params: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  format: VideoSnippetFormat;
  shouldAnimate: boolean;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
}) {
  const { canvasRef, containerRef, format, shouldAnimate, draw } = params;
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    const compositionSize = getVideoSnippetCompositionSize(format);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(420, Math.floor(rect.height));
      const compositionRatio = compositionSize.width / compositionSize.height;
      const containerRatio = width / height;
      const fittedWidth = containerRatio > compositionRatio ? Math.floor(height * compositionRatio) : width;
      const fittedHeight = containerRatio > compositionRatio ? height : Math.floor(width / compositionRatio);
      canvas.width = compositionSize.width;
      canvas.height = compositionSize.height;
      canvas.style.width = `${fittedWidth}px`;
      canvas.style.height = `${fittedHeight}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.imageSmoothingEnabled = true;
      draw(context, compositionSize.width, compositionSize.height);
    };

    const render = () => {
      draw(context, compositionSize.width, compositionSize.height);
      if (shouldAnimate) {
        rafRef.current = window.requestAnimationFrame(render);
      } else {
        rafRef.current = null;
      }
    };

    resize();
    render();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canvasRef, containerRef, draw, format, shouldAnimate]);
}
