/*
 * KittScanner — Barre de scanner rouge animée signature de KITT
 * Style: Rétro-futuriste, LEDs rouges oscillantes
 */

import { useEffect, useRef } from "react";

interface KittScannerProps {
  height?: number;
  className?: string;
  color?: { r: number; g: number; b: number };
}

export default function KittScanner({ height = 8, className = "", color = { r: 255, g: 34, b: 34 } }: KittScannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const posRef = useRef(0);
  const dirRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const NUM_LEDS = 16;
    const LED_W = canvas.width / NUM_LEDS;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = "#0a0000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw LEDs
      for (let i = 0; i < NUM_LEDS; i++) {
        const dist = Math.abs(i - posRef.current);
        const maxDist = 3;
        const intensity = Math.max(0, 1 - dist / maxDist);

        const cr = Math.floor(color.r * intensity);
        const cg = Math.floor(color.g * intensity);
        const cb = Math.floor(color.b * intensity);
        const alpha = 0.15 + intensity * 0.85;

        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        const x = i * LED_W + 2;
        const w = LED_W - 4;
        ctx.fillRect(x, 1, w, canvas.height - 2);

        // Glow
        if (intensity > 0.3) {
          ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity})`;
          ctx.shadowBlur = 10 * intensity;
          ctx.fillStyle = `rgba(${Math.min(255, color.r + 66)}, ${Math.min(255, color.g + 66)}, ${Math.min(255, color.b + 66)}, ${intensity * 0.5})`;
          ctx.fillRect(x + 2, 2, w - 4, canvas.height - 4);
          ctx.shadowBlur = 0;
        }
      }

      // Move scanner
      posRef.current += dirRef.current * 0.08;
      if (posRef.current >= NUM_LEDS - 1) dirRef.current = -1;
      if (posRef.current <= 0) dirRef.current = 1;

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={height}
      className={`w-full ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
