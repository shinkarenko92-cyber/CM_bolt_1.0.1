import { useState } from 'react';
import { Calendar, Home, Settings, BarChart3, Users, LogOut, Shield, Menu, X, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

type SidebarProps = {
  currentView: string;
  onViewChange: (view: string) => void;
};

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { t } = useTranslation();
  const { signOut, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'calendar', icon: Calendar, label: t('nav.calendar') },
    { id: 'properties', icon: Home, label: t('nav.properties') },
    { id: 'bookings', icon: Users, label: t('nav.bookings') },
    { id: 'guests', icon: Users, label: 'Гости' },
    { id: 'messages', icon: MessageCircle, label: t('nav.messages') },
    { id: 'analytics', icon: BarChart3, label: t('nav.analytics') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ];

  if (isAdmin) {
    menuItems.push({ id: 'admin', icon: Shield, label: t('nav.admin') });
  }

  const handleNavClick = (id: string) => {
    onViewChange(id);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-3 left-3 z-50 bg-card border border-border shadow-md"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-mobile-menu"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed md:relative inset-y-0 left-0 z-40 w-64 flex flex-col bg-card border-r border-border shadow-sm',
          'transform transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-4 md:p-5 border-b border-border">
          <div className="flex items-center gap-3 pl-8 md:pl-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-base md:text-lg tracking-tight">Roomi</h1>
              <p className="text-xs text-muted-foreground">Booking Manager</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 h-10 px-3 md:px-4 font-medium text-sm md:text-base',
                  isActive && 'shadow-sm'
                )}
                onClick={() => handleNavClick(item.id)}
                data-testid={`nav-${item.id}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        <Separator />
        <div className="p-3 md:p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 px-3 md:px-4 text-muted-foreground hover:text-foreground"
            onClick={() => signOut()}
            data-testid="button-signout"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="font-medium text-sm md:text-base">{t('auth.signOut')}</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
