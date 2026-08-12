import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { HeroCanvas } from './HeroCanvas';
import { useHeroCapability } from './useHeroCapability';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function Hero() {
  const capability = useHeroCapability();

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-court text-cream">
      <div className="absolute inset-0">
        {capability === 'full' ? (
          <HeroCanvas />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(circle at 70% 30%, rgba(232,116,59,0.35), transparent 55%), radial-gradient(circle at 20% 80%, rgba(212,98,42,0.25), transparent 50%)',
            }}
          />
        )}
      </div>

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-32 text-center">
        <Heading as="h1" size="5xl" className="font-heading uppercase text-cream">
          Moins de tableurs, plus de terrain.
        </Heading>
        <p className="max-w-xl text-lg text-stone-300">
          BasketEasy centralise calendriers, résultats et présences pour les clubs de basket
          amateurs — y compris quand une équipe réunit plusieurs clubs. Pensé pour les bénévoles,
          pas pour les DSI.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => scrollToSection('demo')}>
            Tester la démo live
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-cream text-cream hover:bg-cream/10"
            onClick={() => scrollToSection('ctc-comparison')}
          >
            En savoir plus
          </Button>
        </div>
      </div>
    </section>
  );
}
