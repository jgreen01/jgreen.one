import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: [
    "./src/**/*.{astro,html,js,jsx,tsx,mdx,md}"
  ],
  theme: {
    extend: {
      colors: {
        // These custom color names are mapped to the CSS variables defined in `src/styles/global.css`.
        // The light/dark mode color switching is handled automatically by the CSS media query in that file.
        background: 'var(--bg-color)',
        foreground: 'var(--text-color)',
        accent: 'var(--accent-color)',
        muted: 'var(--muted-color)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace']
      },
      maxWidth: {
        'prose': '65ch'
      }
    }
  },
  plugins: [
    typography
  ]
}