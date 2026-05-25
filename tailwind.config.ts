import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace'],
        serif: ['Source Serif 4', 'Georgia'],
      },
      colors: {
        paper:    '#FAFAF7',
        canvas:   '#F4F3EE',
        surface:  { DEFAULT: '#FFFFFF', 2: '#F7F6F1', 3: '#EFEDE5' },
        hairline: { DEFAULT: '#E6E3DA', strong: '#D4D0C2' },
        ink:      { 1: '#0E0E0C', 2: '#2A2A26', 3: '#5A5750', 4: '#7A776E', 5: '#A09C8E', 6: '#C7C3B5' },
        forest:   { DEFAULT: '#1F3D2E', 2: '#2E5A44', soft: '#E5EDE6' },
        clay:     { DEFAULT: '#B8741E', soft: '#F8EDD9' },
        rust:     { DEFAULT: '#A4231F', soft: '#F5E1DE' },
        gain:     { DEFAULT: '#1B5E3F', soft: '#DDEAE0' },
        earth:    { green: '#6B7F5F', 'green-mid': '#8A9D7F', brown: '#7D6F5F', ochre: '#C4A574', neutral: '#9B8F7F' },
      },
    },
  },
  plugins: [],
};
export default config;
