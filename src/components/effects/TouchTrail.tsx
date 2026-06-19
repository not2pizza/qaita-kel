import React, { useEffect, useRef } from 'react';

export const TouchTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let points: {x: number, y: number, life: number, maxLife: number, vx: number, vy: number}[] = [];
    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    let lastPos = {x: 0, y: 0};

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      lastPos = {x: e.clientX, y: e.clientY};
      
      // Add multiple particles for dense ink effect
      for (let i = 0; i < 4; i++) {
        points.push({
          x: e.clientX + (Math.random() - 0.5) * 10,
          y: e.clientY + (Math.random() - 0.5) * 10,
          life: 1,
          maxLife: 50 + Math.random() * 40,
          vx: dx * 0.05 + (Math.random() - 0.5) * 2,
          vy: dy * 0.05 + (Math.random() - 0.5) * 2
        });
      }
    };
    window.addEventListener('pointermove', handlePointerMove);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Screen blending for vibrant colors
      ctx.globalCompositeOperation = 'screen';
      
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        p.vx *= 0.92; // Friction
        p.vy *= 0.92;
        
        if (p.life <= 0) {
          points.splice(i, 1);
          i--;
          continue;
        }

        const progress = 1 - (p.life / p.maxLife);
        const radius = 20 + progress * 50; // Expands over time like ink spreading
        const opacity = Math.max(0, (p.life / p.maxLife) * 0.6);

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        // Turquoise to Blue gradient
        gradient.addColorStop(0, `rgba(0, 240, 255, ${opacity})`);
        gradient.addColorStop(0.4, `rgba(0, 120, 255, ${opacity * 0.6})`);
        gradient.addColorStop(1, 'rgba(0, 50, 255, 0)');

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'fixed', 
        top: 0, 
        left: 0, 
        pointerEvents: 'none', 
        zIndex: 9999 
      }} 
    />
  );
};
