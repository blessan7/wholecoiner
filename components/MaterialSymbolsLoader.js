'use client';

import { useEffect } from 'react';

/**
 * MaterialSymbolsLoader - Client component to load Material Symbols font
 */
export default function MaterialSymbolsLoader() {
  useEffect(() => {
    // Check if link already exists
    const existingLink = document.querySelector('link[href*="Material+Symbols"]');
    if (existingLink) return;

    // Add preconnect links
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect2);

    // Add Material Symbols stylesheet
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  return null;
}

