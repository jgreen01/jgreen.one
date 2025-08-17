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
        background: "#fdfdfd",
        foreground: "#282728",
        accent: "#0ea5e9",
        muted: "#e5e7eb",
        backgroundDark: "#212737",
        foregroundDark: "#eaeef3",
        accentDark: "#38bdf8",
        mutedDark: "#374151"
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
