'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Three selectable themes plus the implicit "system" option:
 *   light · dark · blue (liquid-glass over a blue aurora).
 *
 * The class lands on <html>; every theme-scoped token lives in globals.css.
 * Persistence, pre-render application and cross-component sync are handled
 * by next-themes + the migration script in layout.tsx.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      themes={['light', 'dark', 'blue']}
      enableSystem
    >
      {children}
    </NextThemesProvider>
  );
}
