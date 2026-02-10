import { Link } from 'react-router-dom';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="flex-1 flex items-center justify-center w-full">{children}</div>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <Link to="/terms" className="hover:underline">Условия использования</Link>
        {' · '}
        <Link to="/privacy" className="hover:underline">Политика конфиденциальности</Link>
      </footer>
    </div>
  );
}
