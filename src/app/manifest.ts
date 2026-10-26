import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DeutschFlow — জার্মান শেখা সহজে',
    short_name: 'DeutschFlow',
    description:
      'শোনো, উচ্চারণ শেখো, জার্মান বলো — বাংলা উচ্চারণসহ জার্মান A1 প্র্যাকটিস অ্যাপ।',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f2ea',
    theme_color: '#1c7a4c',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
