import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-16 sm:pb-14">
      <div className="relative min-h-screen w-full">{children}</div>
      <footer className="absolute bottom-4 left-0 right-0 z-20 px-4 text-center text-sm text-muted-foreground">
        <Link to="/terms" className="hover:underline">{t('auth.termsOfUse')}</Link>
        {' · '}
        <Link to="/privacy" className="hover:underline">{t('auth.privacyPolicy')}</Link>
      </footer>
    </div>
  );
}
