/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The one accent used for links, active nav, primary buttons and the
        // "Tomorrow" half of the welcome banner.
        teal: {
          DEFAULT: '#0D7377',
          dark: '#0A5C5F',
          light: '#14A0A5',
        },
        // Sidebar. Near-black with a green cast so it reads as the same family
        // as the teal accent rather than a neutral navy.
        sidebar: {
          DEFAULT: '#0F2E2C',
          hover: '#17403D',
        },
        // Page background behind the white cards.
        mint: '#F1F7F5',
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 46, 44, 0.06), 0 1px 2px rgba(15, 46, 44, 0.04)',
      },
    },
  },
  plugins: [],
};
