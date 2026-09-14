import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssTypography from '@tailwindcss/typography';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      // Homepage navbar breakpoints — mirror the design's JS thresholds:
      // full inline nav >=1240, wrapped second-row nav 700-1239, hamburger <700.
      screens: {
        navrow: '700px',
        nav: '1240px',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Luna brand — kept as hex tokens so hero gradients / accent blocks can
        // pull the exact brand colour without going through HSL conversion.
        // Palette from the 12.09.2026 LTL moodboard (8 swatches, sampled).
        luna: {
          navy: '#002F67',        // #012E66 on the board — flyer hex kept
          'navy-deep': '#041C64',
          steel: '#3C6697',
          blue: '#2077C3',
          teal: '#20AFDA',
          cyan: '#1AEBF5',
          'cyan-light': '#5DDDEA', // readable accent text on navy (not on the board)
          slate: '#41536F',
          // Homepage-redesign tokens (Claude Design "Homepage Luna", 2026-09-14).
          // Deep indigo-navy system used by the navbar, hero, CTA band + footer.
          ink: '#0A1650',        // primary dark surface (navbar, hero, footer)
          ink2: '#060A18',       // darkest strip (footer legal bar)
          royal: '#0D2E6B',      // raised nav pill / mid gradient stop
          azure: '#2E6FD1',      // nav pill hover
          sky: '#1FA3C9',        // link / icon accent
          aqua: '#1FE0F0',       // primary CTA + active pill
          aqua2: '#6BEDF7',      // CTA hover
          hair: '#2A4380',       // hairline borders on ink
          mist: '#F4F7FB',       // off-white section ground
          body: '#4A5A75',       // body text on light
          'muted-ink': '#4A6FA0',// muted heading/text on light
        },
      },
      backgroundImage: {
        'luna-gradient': 'linear-gradient(135deg, #002F67 0%, #2077C3 55%, #1AEBF5 100%)',
        'luna-gradient-soft': 'linear-gradient(135deg, #041C64 0%, #2077C3 60%, #20AFDA 100%)',
        // Wordmark gradient (LUNA in the logo): blue → cyan, left to right.
        'luna-wordmark': 'linear-gradient(90deg, #2077C3 0%, #1AEBF5 100%)',
      },
      // Moodboard type scale: titles 32, subtitles 20, text 13-15. Mapped
      // onto Tailwind's steps so existing class names keep working.
      fontSize: {
        xs:   ['0.75rem',   { lineHeight: '1.4' }],
        sm:   ['0.8125rem', { lineHeight: '1.5' }],
        base: ['0.9375rem', { lineHeight: '1.6' }],
        lg:   ['1.0625rem', { lineHeight: '1.5' }],
        xl:   ['1.125rem',  { lineHeight: '1.45' }],
        '2xl': ['1.25rem',  { lineHeight: '1.4' }],
        '3xl': ['1.5rem',   { lineHeight: '1.3' }],
        '4xl': ['2rem',     { lineHeight: '1.2' }],
        '5xl': ['2rem',     { lineHeight: '1.2' }],
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
} satisfies Config;
