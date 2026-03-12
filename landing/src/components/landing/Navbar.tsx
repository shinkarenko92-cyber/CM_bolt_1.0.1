import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Building2, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Возможности', href: '#features' },
  { label: 'Как работает', href: '#how-it-works' },
  { label: 'Тарифы', href: '#pricing' },
  { label: 'Отзывы', href: '#testimonials' },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-background/85 backdrop-blur-md border-b border-border/40 shadow-sm'
          : 'bg-transparent'
      )}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 gradient-hero rounded-lg flex items-center justify-center shadow-sm">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold font-display">Roomi</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium px-3 py-2 rounded-md hover:bg-secondary/60"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://app.roomi.pro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Войти
          </a>
          <Button variant="hero" size="sm" asChild>
            <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
              Начать бесплатно
            </a>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-md hover:bg-secondary/60 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Меню"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <div
        className={cn(
          'md:hidden overflow-hidden transition-all duration-300',
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="bg-background/95 backdrop-blur-md border-b border-border px-4 py-5 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="text-left text-foreground font-medium px-3 py-2.5 rounded-md hover:bg-secondary/60 transition-colors"
            >
              {link.label}
            </button>
          ))}
          <div className="border-t border-border mt-2 pt-4 flex flex-col gap-2">
            <a
              href="https://app.roomi.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground text-center py-2"
            >
              Войти
            </a>
            <Button variant="hero" asChild>
              <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                Начать бесплатно
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
