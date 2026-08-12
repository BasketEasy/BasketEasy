import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Badge } from '@basketeasy/ui/badge';
import { useAccount } from '../../auth/useAccount';

export function Navbar() {
  const navigate = useNavigate();
  const { user, isLoading } = useAccount();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-court/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <span className="font-heading text-2xl font-extrabold text-orange">BasketEasy</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Pensé pour les CTC & Ententes
        </Badge>
        <div className="flex flex-wrap items-center gap-3">
          {!isLoading &&
            (user ? (
              <Button
                className="shrink-0 whitespace-nowrap"
                onClick={() => navigate('/dashboard')}
              >
                Mon espace
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="shrink-0 whitespace-nowrap text-cream hover:bg-white/10"
                  onClick={() => navigate('/login')}
                >
                  Se connecter
                </Button>
                <Button
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => navigate('/register')}
                >
                  Créer un compte
                </Button>
              </>
            ))}
        </div>
      </nav>
    </header>
  );
}
