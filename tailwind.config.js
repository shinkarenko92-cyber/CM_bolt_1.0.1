/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        light: {
          bg: {
            primary: '#f8fafc',
            secondary: '#ffffff',
            tertiary: '#f1f5f9',
          },
          border: {
            primary: '#e2e8f0',
            secondary: '#cbd5e1',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
            tertiary: '#64748b',
          },
        },
      },
    },
  },
  plugins: [],
};
