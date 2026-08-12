import { useNavigate } from 'react-router-dom';

// Only "Connexion club" points somewhere real (/login). The other three
// have no pages yet, so they render as plain text rather than dead
// href="#" links — same "don't imply functionality that isn't there"
// principle as the Bientôt badges elsewhere on this page.
const PLACEHOLDER_LINKS = ['Contact', 'Mentions légales', 'Politique de confidentialité'];

export function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="bg-charcoal px-6 py-16 text-center text-cream">
      <div className="mx-auto max-w-5xl">
        <p className="font-heading text-5xl font-extrabold uppercase tracking-tight">
          BasketEasy
        </p>
        <p className="mt-4 text-sm text-stone-400">Données hébergées en France · RGPD</p>
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {PLACEHOLDER_LINKS.map((label) => (
            <span key={label} className="text-stone-500">
              {label}
            </span>
          ))}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-cream underline-offset-4 hover:underline"
          >
            Connexion club
          </button>
        </nav>
      </div>
    </footer>
  );
}
