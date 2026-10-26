'use client';

import { GraduationCap } from 'lucide-react';

export function Hero() {
  return (
    <section className="df-fade-up px-4 pb-1 pt-10 text-center sm:pt-14" aria-labelledby="hero-heading">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground font-bangla">
        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
        জার্মান শেখা · A1 লেভেল
      </span>
      <h1
        id="hero-heading"
        className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Listen. Learn.{' '}
        <span className="text-primary">Speak German.</span>
      </h1>
      <p className="mt-3 text-base text-muted-foreground font-bangla sm:text-lg">
        শোনো, উচ্চারণ শেখো, জার্মান বলো।
      </p>
    </section>
  );
}
