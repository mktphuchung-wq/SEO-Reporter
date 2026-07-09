"use client";

import { useEffect, useRef } from "react";

export default function WindRoadCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animationId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#082f49");
      gradient.addColorStop(0.55, "#0e7490");
      gradient.addColorStop(1, "#f8fafc");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(width / 2, height * 0.62);
      for (let i = 0; i < 34; i += 1) {
        const z = i / 34;
        const y = -z * height * 0.86;
        const scale = 1 - z * 0.72;
        const wave = Math.sin(frame * 0.018 + i * 0.55) * 24 * scale;
        context.strokeStyle = `rgba(255,255,255,${0.12 + z * 0.18})`;
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(-width * 0.45 * scale + wave, y);
        context.quadraticCurveTo(0, y - 20 * scale, width * 0.42 * scale + wave, y + 8 * scale);
        context.stroke();
      }

      context.fillStyle = "rgba(6, 78, 59, 0.55)";
      context.beginPath();
      context.moveTo(-width * 0.22, height * 0.16);
      context.quadraticCurveTo(0, -height * 0.25, width * 0.28, height * 0.16);
      context.lineTo(width * 0.12, height * 0.4);
      context.quadraticCurveTo(0, height * 0.52, -width * 0.22, height * 0.16);
      context.fill();

      for (let i = 0; i < 6; i += 1) {
        const x = -width * 0.32 + i * width * 0.12;
        const y = -height * 0.04 + Math.sin(frame * 0.015 + i) * 10;
        const mast = 58 - i * 4;
        context.strokeStyle = "rgba(255,255,255,0.78)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x, y + mast);
        context.lineTo(x, y);
        context.stroke();
        context.save();
        context.translate(x, y);
        context.rotate(frame * 0.035 + i);
        for (let blade = 0; blade < 3; blade += 1) {
          context.rotate((Math.PI * 2) / 3);
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(0, -28);
          context.stroke();
        }
        context.restore();
      }
      context.restore();

      frame += 1;
      animationId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="wind-canvas" aria-label="Mô phỏng đường gió 3D Phú Quý" />;
}
