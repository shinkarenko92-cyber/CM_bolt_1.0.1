import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative min-h-screen w-full">{children}</div>
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-center text-sm text-muted-foreground whitespace-nowrap">
        <Link to="/terms" className="hover:underline">{t('auth.termsOfUse')}</Link>
        {' · '}
        <Link to="/privacy" className="hover:underline">{t('auth.privacyPolicy')}</Link>
      </footer>
    </div>
  );
}
