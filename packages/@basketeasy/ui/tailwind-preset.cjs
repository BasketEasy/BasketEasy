/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Surface ladder. Today body, Card, Dialog and Input are all #FAF5EF,
        // so nothing looks placed on anything. `cream` stays as an alias of
        // surface-2 so existing bg-cream / text-cream call sites keep working.
        ground: '#EFE4D4',
        surface: '#FFFCF7',
        'surface-2': '#FAF5EF',
        sunk: '#E9DDCA',
        cream: '#FAF5EF',

        orange: {
          DEFAULT: '#D4622A',
          // Darker shade of brand orange for text/foreground use. `orange`
          // (#D4622A) only measures 3.47:1 against cream (#FAF5EF) — below
          // WCAG AA's 4.5:1 for normal text. This shade keeps the same hue
          // and saturation, just darker, and measures 5.03:1 against cream.
          text: '#AA4F22',
          hover: '#95441C',
          tint: '#FBEDE4',
        },
        'blue-green': {
          DEFAULT: '#1E5F74',
          2: '#2F6E80',
          tint: '#EAF1F3',
        },
        // Best-player trophy/leaderboard accent (Vote tab) — distinct from
        // orange on purpose, so voting doesn't compete visually with the
        // primary-action color. See docs/superpowers/specs/2026-08-27-match-interface-design.md.
        gold: { DEFAULT: '#C08A2E', text: '#8C5F16', tint: '#FBF1DC' },
        charcoal: '#23201C',
        muted: '#5B564F',
        border: { DEFAULT: '#E7DECF', strong: '#D6C8B2' },
        error: { DEFAULT: '#B23A2E', tint: '#F7EAE8' },
        success: '#2F7D5C',
      },
      fontFamily: {
        heading: ['"Big Shoulders Display"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible"', 'Verdana', 'system-ui', 'sans-serif'],
      },
      // Stock Tailwind shadows are neutral grey and read cold on a warm
      // ground. Overriding the scale upgrades every existing shadow-* call
      // site without touching one of them.
      boxShadow: {
        sm: '0 1px 2px rgba(59, 42, 24, 0.07)',
        DEFAULT: '0 2px 6px rgba(59, 42, 24, 0.08), 0 1px 2px rgba(59, 42, 24, 0.05)',
        md: '0 2px 6px rgba(59, 42, 24, 0.08), 0 1px 2px rgba(59, 42, 24, 0.05)',
        lg: '0 10px 28px rgba(59, 42, 24, 0.11), 0 2px 6px rgba(59, 42, 24, 0.06)',
        'nav-active': 'inset 0 -2px 0 #D4622A',
        'segment-active': 'inset 0 -3px 0 rgba(0, 0, 0, 0.18)',
      },
      minWidth: {
        // The dropdown-menu content's floor width, previously an arbitrary
        // min-w-[14rem] at the DropdownMenuContent call site.
        menu: '14rem',
      },
      maxWidth: {
        // Radix Popper measures the space left in the viewport on the side it
        // placed the content and exposes it as this custom property. Capping
        // the menu at it keeps a long email or club name inside the viewport
        // at 320px instead of running hundreds of px off the right edge.
        'menu-available': 'var(--radix-dropdown-menu-content-available-width)',
      },
      letterSpacing: {
        'wide-caps': '0.13em',
        section: '0.11em',
        // Uppercase eyebrow labels set in the body font (Atkinson
        // Hyperlegible), not the condensed heading font — needs less
        // tracking than wide-caps/section, which are both sized for Big
        // Shoulders Display. Introduced for the Vote tab's ballot category
        // labels (Vote.dc.html).
        eyebrow: '0.08em',
      },
    },
  },
};
