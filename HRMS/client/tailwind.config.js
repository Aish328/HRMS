/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#0B0F17', 900: '#0E1420', 800: '#141C2C', 700: '#1D2941', 600: '#2B3A5C' },
        mist: { 50: '#F7F8FB', 100: '#F0F3F8', 200: '#E3E8F1', 300: '#CBD4E3' },
        cobalt: { 300: '#8EA2FF', 400: '#5F77F5', 500: '#2952E3', 600: '#1F41BC', 700: '#183394' },
        saffron: { 400: '#F6B54A', 500: '#F0A020', 600: '#D18410' },
        jade: { 400: '#2BC894', 500: '#17A57A', 600: '#0E805E' },
        coral: { 400: '#EF6B6A', 500: '#E24C4B', 600: '#C13736' },
      },
      boxShadow: {
        glass: '0 8px 32px rgba(14, 20, 32, 0.10)',
        glow: '0 0 0 4px rgba(41, 82, 227, 0.15)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '0.5' }, '100%': { transform: 'scale(1.35)', opacity: '0' } },
      },
      animation: {
        rise: 'rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
};
