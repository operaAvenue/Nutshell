import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const CANNABIS_LEAF_PATH = "M12,22c0.28,0,0.5-0.22,0.5-0.5v-3.78l2.29,2.29c0.2,0.2,0.51,0.2,0.71,0c0.2,-0.2,0.2,-0.51,0,-0.71l-1.92,-1.92l3.22,0.92c0.39,0.11,0.8,-0.12,0.91,-0.51c0.11,-0.39,-0.12,-0.8,-0.51,-0.91l-3.03,-0.86l3.47,-0.99c0.39,-0.11,0.61,-0.52,0.5,-0.91c-0.11,-0.39,-0.52,-0.61,-0.91,-0.5l-2.88,0.82l1.83,-2.75c0.22,-0.33,0.13,-0.78,-0.2,-1l-2.51,-1.67c-0.28,-0.19,-0.65,-0.19,-0.93,0l-2.51,1.67c-0.33,0.22,-0.42,0.67,-0.2,1l1.83,2.75l-2.88,-0.82c-0.39,-0.11,-0.8,0.11,-0.91,0.5c-0.11,0.39,0.11,0.8,0.5,0.91l3.47,0.99l-3.03,0.86c-0.39,0.11,-0.62,0.52,-0.51,0.91c0.11,0.39,0.52,0.62,0.91,0.51l3.22,-0.92l-1.92,1.92c-0.2,0.2,-0.2,0.51,0,0.71c0.2,0.2,0.51,0.2,0.71,0l2.29,-2.29v3.78c0,0.28,0.22,0.5,0.5,0.5z M12,8.5c0.28,0,0.5,-0.22,0.5,-0.5v-3.78l0.8,1.6c0.12,0.24,0.37,0.38,0.63,0.38c0.08,0,0.17,-0.01,0.25,-0.04c0.31,-0.11,0.47,-0.45,0.36,-0.76l-1.5,-3c-0.23,-0.46,-0.85,-0.46,-1.08,0l-1.5,3c-0.11,0.31,0.05,0.65,0.36,0.76c0.08,0.03,0.17,0.04,0.25,0.04c0.26,0,0.51,-0.14,0.63,-0.38l0.8,-1.6v3.78c0,0.28,0.22,0.5,0.5,0.5z";

export default function BackgroundEffects() {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; duration: number; delay: number }[]>([]);
  const [effect, setEffect] = useState(() => localStorage.getItem('background_effect') || 'particles');

  useEffect(() => {
    // Generate static metadata for particles
    const list = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 15 + 8,
      delay: Math.random() * 8,
    }));
    setParticles(list);
  }, []);

  // Poll local storage to update effect setting dynamically
  useEffect(() => {
    const checkEffect = () => {
      const saved = localStorage.getItem('background_effect') || 'particles';
      if (saved !== effect) {
        setEffect(saved);
      }
    };
    const interval = setInterval(checkEffect, 500);
    return () => clearInterval(interval);
  }, [effect]);

  if (effect === 'none') {
    return (
      <div className="fixed inset-0 pointer-events-none z-[-1] mesh-bg overflow-hidden">
        {/* Ambient Orbs */}
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
        <div className="ambient-orb orb-3" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] mesh-bg overflow-hidden select-none">
      {/* Ambient Orbs */}
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />
      <div className="ambient-orb orb-3" />

      {/* Render selected background effect */}
      {particles.map((p) => {
        if (effect === 'leaves') {
          // Cannabis Leaves falling downwards with rotation and slight sway
          const size = p.size * 3.5 + 6; // 13px to 20px (small and translucent)
          return (
            <motion.div
              key={p.id}
              className="absolute text-emerald-500/25"
              style={{
                width: size,
                height: size,
                left: `${p.x}%`,
                top: `-40px`,
              }}
              animate={{
                y: ['0vh', '110vh'],
                rotate: [0, 360],
                x: [`${p.x}%`, `${p.x + (p.id % 2 === 0 ? 6 : -6)}%`],
              }}
              transition={{
                duration: p.duration * 1.2,
                delay: p.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            >
              <svg viewBox="0 0 24 24" className="w-full h-full fill-current">
                <path d={CANNABIS_LEAF_PATH} />
              </svg>
            </motion.div>
          );
        } else if (effect === 'rain') {
          // Digital matrix rain lines falling downwards
          return (
            <motion.div
              key={p.id}
              className="absolute"
              style={{
                width: '1px',
                height: `${p.size * 6}px`,
                left: `${p.x}%`,
                top: `-50px`,
                background: 'linear-gradient(to bottom, rgba(255,255,255,0), var(--accent-500))',
                opacity: 0.15,
              }}
              animate={{
                y: ['0vh', '110vh'],
              }}
              transition={{
                duration: p.duration * 0.4, // much faster
                delay: p.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          );
        } else {
          // Default: Glowing dots floating upwards
          return (
            <motion.div
              key={p.id}
              className="particle"
              style={{
                width: p.size,
                height: p.size,
                left: `${p.x}%`,
                top: `${p.y}%`,
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                boxShadow: '0 0 8px var(--accent-400)',
              }}
              animate={{
                y: ['0vh', '-100vh'],
                opacity: [0, 0.7, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          );
        }
      })}
    </div>
  );
}
