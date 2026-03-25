import { Calendar, Home, MessageCircle, BarChart3, Settings, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type BottomNavProps = {
  currentView: string;
  onViewChange: (view: string) => void;
};

export function BottomNav({ currentView, onViewChange }: BottomNavProps) {
  const { t } = useTranslation();
  const { profile, isAdmin } = useAuth();
  const isCleaner = profile?.role === 'cleaner';

  const items = [
    { id: 'calendar', icon: Calendar, label: t('nav.calendar') },
    { id: 'properties', icon: Home, label: t('nav.properties') },
    { id: 'messages', icon: MessageCircle, label: t('nav.messages') },
    { id: 'cleaning', icon: Sparkles, label: t('nav.cleaning', { defaultValue: 'Уборка' }) },
    { id: 'analytics', icon: BarChart3, label: t('nav.analytics') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ].filter(item => {
    if (isCleaner) return ['cleaning', 'settings'].includes(item.id);
    if (item.id === 'cleaning' && !isAdmin) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card/95 backdrop-blur-md border-t border-border shadow-lg safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[56px] py-2 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
