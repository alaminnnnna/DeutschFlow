'use client';

import { useTheme } from 'next-themes';
import { Droplets, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Cycles light → dark → blue (liquid glass) → light.
 * Icons are swapped purely with CSS variant classes so there is never a
 * hydration flash: Sun in light, Moon in dark, Droplets in blue mode.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const cycle = () => {
    if (resolvedTheme === 'dark') setTheme('blue');
    else if (resolvedTheme === 'blue') setTheme('light');
    else setTheme('dark');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Switch theme: light, dark or blue"
      title="Light → Dark → Blue"
      onClick={cycle}
      className="rounded-full text-muted-foreground hover:text-foreground"
    >
      <Sun className="h-[18px] w-[18px] dark:hidden blue:hidden" aria-hidden="true" />
      <Moon className="hidden h-[18px] w-[18px] dark:block blue:hidden" aria-hidden="true" />
      <Droplets className="hidden h-[18px] w-[18px] blue:block" aria-hidden="true" />
    </Button>
  );
}
