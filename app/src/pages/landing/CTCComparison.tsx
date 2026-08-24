import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Heading } from '@basketeasy/ui/heading';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const CHAOS_PANELS = [
  'AIL de Goulaine — effectif Excel',
  'Entente Sud Basket — fil WhatsApp',
  'CTC Basket 44 — portail séparé',
];

const RESOLUTION_COPY = 'Une seule liste, alimentée automatiquement par les trois clubs.';

export function CTCComparison() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const section = sectionRef.current;
    const reveal = revealRef.current;
    if (!section || !reveal) {
      return;
    }

    const tween = gsap.fromTo(
      reveal,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)',
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=100%',
          scrub: true,
          pin: true,
        },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      id="ctc-comparison"
      ref={sectionRef}
      className="relative overflow-hidden bg-court py-24 text-cream"
    >
      <div className="mx-auto max-w-5xl px-6 text-center">
        <Heading as="h2" size="4xl" className="font-heading uppercase text-orange">
          Une équipe, plusieurs clubs ? Enfin un seul outil.
        </Heading>
      </div>

      <div className="relative mx-auto mt-12 max-w-5xl px-6">
        {prefersReducedMotion ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-1 rounded-xl bg-stone-800 p-6 opacity-60">
              {CHAOS_PANELS.map((label) => (
                <p key={label} className="text-sm text-stone-400">
                  {label}
                </p>
              ))}
            </div>
            <div className="flex items-center justify-center rounded-xl bg-card p-6 text-center">
              <p className="text-lg font-semibold text-cream">{RESOLUTION_COPY}</p>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl">
            <div className="grid grid-cols-1 gap-1 opacity-50 blur-sm md:grid-cols-3">
              {CHAOS_PANELS.map((label) => (
                <div key={label} className="rounded-xl bg-stone-800 p-6 text-sm text-stone-400">
                  {label}
                </div>
              ))}
            </div>
            <div
              ref={revealRef}
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-card p-6 text-center"
              style={{ clipPath: 'inset(0 100% 0 0)' }}
            >
              <p className="text-lg font-semibold text-cream">{RESOLUTION_COPY}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
