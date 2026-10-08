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
        // primary-action color. See docs/decisions/events.md.
        gold: { DEFAULT: '#C08A2E', text: '#8C5F16', tint: '#FBF1DC' },
        // Points-repartition ramp (PointsRepartitionBar). One hue — the
        // blue-green that already carries structure — stepped by lightness,
        // darkest for the most expensive basket. Sequential rather than three
        // unrelated hues because the three buckets are ordered (3 > 2 > 1),
        // and a categorical palette would imply they aren't. `three` is the
        // blue-green DEFAULT value, named separately because the bar's
        // meaning is its own: a later change to brand blue-green must not
        // silently reorder the ramp. Contrast is why `free` pairs with
        // charcoal text while the two darker steps pair with cream.
        points: { three: '#1E5F74', two: '#3E88A1', free: '#82B5C6' },
        charcoal: '#23201C',
        muted: '#5B564F',
        border: { DEFAULT: '#E7DECF', strong: '#D6C8B2' },
        error: { DEFAULT: '#B23A2E', tint: '#F7EAE8' },
        // `text` mirrors `gold.text`/`error`'s darker-shade pattern: the flat
        // DEFAULT only measures 4.27:1 on a `/10` tint background, under the
        // 4.5:1 AA bar for Badge's small text — `text` clears it at 6.4:1.
        // tint = success at 10% over `surface`, pre-mixed so it is opaque
        // (a toast floats over content; a translucent fill let it show through).
        success: { DEFAULT: '#2F7D5C', text: '#245F48', tint: '#EAEFE8' },
      },
      fontSize: {
        // In-graphic numerals — the counts printed inside a
        // PointsRepartitionBar segment. text-xs (12px) overflows a 14px-tall
        // bar, so this is the one step below it, named rather than written as
        // an arbitrary text-[10px] at the call site.
        'bar-count': ['0.625rem', { lineHeight: '1' }],
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
        // The bottom tab bar's active item. Not `nav-active`: that one is
        // `inset 0 -2px 0`, a rule along the *bottom* edge, which is where a
        // top navigation's underline belongs. In a bar pinned to the bottom
        // of the viewport the same rule would be drawn against the edge of
        // the screen and read as a stray line, so the mirrored inset puts it
        // along the top edge, between the bar and the content it covers.
        'nav-active-top': 'inset 0 2px 0 #D4622A',
        'segment-active': 'inset 0 -3px 0 rgba(0, 0, 0, 0.18)',
        // DeviceFrame (`@basketeasy/ui/device-frame`): a product screenshot
        // lifted off the page. Deeper and wider than shadow-lg because the
        // frame is the hero of its section, not a card among others; the
        // phone's is darker because its bezel is charcoal, not surface.
        'frame-browser': '0 18px 40px rgba(59, 42, 24, 0.16), 0 4px 10px rgba(59, 42, 24, 0.08)',
        'frame-phone': '0 18px 40px rgba(59, 42, 24, 0.22), 0 4px 10px rgba(59, 42, 24, 0.12)',
        // A bar pinned to the bottom of the viewport (the landing page's
        // mobile CTA bar): the shadow falls upward, onto the content it covers.
        'bar-up': '0 -6px 16px rgba(59, 42, 24, 0.1)',
      },
      // Radius scale, overridden like boxShadow so every existing rounded-*
      // call site picks up the Parquet shapes without being touched: `md`
      // for controls (buttons, inputs, time blocks), `lg` for cards, `xl`
      // for dialogs, `2xl` for a bottom sheet's top corners. `sm`, DEFAULT
      // and `full` keep Tailwind's values — they're used for hairline
      // details (swatches, bars, pills) the revamp didn't reshape.
      borderRadius: {
        md: '10px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
        // DeviceFrame's phone: the bezel, and the screen inside its 10px
        // padding (bezel radius minus padding, so the two curves stay parallel).
        device: '40px',
        'device-screen': '30px',
      },
      spacing: {
        // Switch geometry (`@basketeasy/ui/switch`): a 40 x 24 track holding
        // an 18px thumb with a 3px margin, so the thumb travels 16px.
        'switch-thumb': '18px',
        'switch-inset': '3px',
        'switch-travel': '16px',
      },
      minWidth: {
        // The dropdown-menu content's floor width, previously an arbitrary
        // min-w-[14rem] at the DropdownMenuContent call site.
        menu: '14rem',
      },
      width: {
        // The notification bell's dropdown. Wider than a plain action menu
        // (min-w-menu) because its rows carry a full sentence of body copy,
        // not a one-word label; narrower than a dialog because it is still an
        // overlay hanging off a header button. Capped by max-w-menu-available
        // at the call site, so it never runs off a narrow viewport.
        notifications: '24rem',
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
