/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fredoka', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Warm, candy-ish pastel palette.
        cream: '#fff7ed',
        peach: '#ffb4a2',
        coral: '#ff8fab',
        bubble: '#ffc8dd',
        sky: '#a2d2ff',
        mint: '#b9fbc0',
        lemon: '#fdffb6',
        grape: '#cdb4db',
        ink: '#4a3f55', // soft dark for text/borders instead of harsh black
      },
      boxShadow: {
        // Chunky offset "sticker" shadows.
        pop: '4px 4px 0 0 rgba(74,63,85,0.9)',
        'pop-sm': '3px 3px 0 0 rgba(74,63,85,0.85)',
        'pop-lg': '6px 6px 0 0 rgba(74,63,85,0.9)',
        soft: '0 8px 24px -6px rgba(74,63,85,0.35)',
      },
      borderRadius: {
        blob: '1.75rem',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        wiggle: 'wiggle 0.4s ease-in-out',
        pop: 'pop 0.18s ease-out',
        float: 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
