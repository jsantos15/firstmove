'use client';

import type { OpeningDifficulty } from '@firstmove/core';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'white' | 'black' | 'beginner' | 'intermediate' | 'advanced' | 'eco' | 'tag';
  className?: string;
}

export function Badge({ children, variant = 'tag', className = '' }: BadgeProps) {
  const styles: Record<string, string> = {
    white: 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
    black: 'bg-blue-400/10 text-blue-400 border border-blue-400/20',
    beginner: 'bg-green-400/10 text-green-400 border border-green-400/20',
    intermediate: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
    advanced: 'bg-red-400/10 text-red-400 border border-red-400/20',
    eco: 'bg-white/5 text-gray-400 border border-white/10 font-mono',
    tag: 'bg-white/5 text-gray-500 border border-white/10',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: OpeningDifficulty }) {
  const labels: Record<OpeningDifficulty, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };
  return <Badge variant={difficulty}>{labels[difficulty]}</Badge>;
}

export function ColorBadge({ color }: { color: 'white' | 'black' }) {
  return <Badge variant={color}>{color === 'white' ? '♔ White' : '♚ Black'}</Badge>;
}
