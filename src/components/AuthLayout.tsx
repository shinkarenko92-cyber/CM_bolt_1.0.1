import { Link } from 'react-router-dom';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative min-h-screen w-full">{children}</div>
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-center text-sm text-muted-foreground whitespace-nowrap">
        <Link to="/terms" className="hover:underline">Условия использования</Link>
        {' · '}
        <Link to="/privacy" className="hover:underline">Политика конфиденциальности</Link>
      </footer>
    </div>
  );
}
