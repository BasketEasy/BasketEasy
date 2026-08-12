import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heading } from '@basketeasy/ui/heading';
import { SANDBOX_ROSTER, type RosterPlayer } from './data';

export function PresenceSandbox() {
  const [roster, setRoster] = useState<RosterPlayer[]>(SANDBOX_ROSTER);

  function toggleStatus(id: number) {
    setRoster((current) =>
      current.map((player) =>
        player.id === id
          ? { ...player, status: player.status === 'present' ? 'absent' : 'present' }
          : player,
      ),
    );
  }

  const presentCount = roster.filter((player) => player.status === 'present').length;

  return (
    <section id="demo" className="bg-cream py-24 text-charcoal">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-12 text-center">
          <Heading as="h2" size="5xl" className="font-heading uppercase text-orange-text">
            Gérez les présences en 1 clic
          </Heading>
          <p className="mt-2 font-medium text-blue-green">
            Simulez la convocation d&apos;une équipe CTC réagissant en temps réel.
          </p>
        </div>

        <div className="rounded-3xl border border-orange/30 bg-card p-8 text-cream shadow-2xl">
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-blue-green">
                Match du samedi · U17-1 CTC
              </span>
              <h3 className="font-heading text-2xl font-bold">Feuille de match</h3>
            </div>
            <div className="rounded-xl bg-orange px-4 py-2 font-mono text-sm font-bold">
              {presentCount} / {roster.length} PRÉSENTS
            </div>
          </div>

          <div className="space-y-4">
            {roster.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-4"
              >
                <div>
                  <p className="text-base font-bold">{player.name}</p>
                  <p className="text-xs text-stone-400">{player.club}</p>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleStatus(player.id)}
                  className={
                    player.status === 'present'
                      ? 'rounded-lg bg-orange px-5 py-2 text-xs font-bold text-cream shadow-lg shadow-orange/30 transition-colors'
                      : 'rounded-lg bg-stone-800 px-5 py-2 text-xs font-bold text-stone-400 transition-colors'
                  }
                >
                  {player.status === 'present' ? '✓ PRÉSENT' : '✕ ABSENT'}
                </motion.button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
