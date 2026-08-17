/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Palette sampled pixel-by-pixel from the Figma "TalkTalk" Master Shots
      // frames (design/screens/34-69), not eyeballed — see PLN-260817 §2. The
      // ramp is indigo no longer: the design's action colour is a brighter blue
      // and every accent moved with it.
      colors: {
        primary: {
          50: '#EFF3FF', // affiliate step cards (frame 65)
          100: '#DBEAFE', // quick-action chip fill (frame 54)
          200: '#BEDBFF',
          300: '#8EC5FF',
          400: '#51A2FF',
          500: '#2B7FFF', // user bubble, send button, stepper (frames 57, 49)
          600: '#155DFC', // hover
          700: '#1447E6', // quick-action chip text (frame 54)
          800: '#193CB8',
          900: '#1C398E',
        },
        success: '#00C950', // "Confirmed" badge (frame 34)
        warning: '#FF6900', // "In Transit" badge + in-progress copy (frame 49)
        error: '#FF385C', // tab count badge, unread dot (frame 34)
        info: '#3B82F6',
        /** "Review" badge — a status colour the old palette had no slot for. */
        review: '#AD46FF', // frame 57
        /**
         * Newest-unread notification row wash — warm, deliberately not a gray.
         * `icon` is the deeper tint the row's avatar circle takes so it does not
         * disappear into the row behind it (frame 34).
         */
        highlight: { DEFAULT: '#FEF9F3', icon: '#F5E6D3' },
        gray: {
          50: '#F9FAFB', // date-group band
          100: '#F3F4F6', // bot bubble, idle filter chip
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        lg: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
};
