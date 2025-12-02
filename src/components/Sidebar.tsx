import { useState } from 'react';
import { Calendar, Home, Settings, BarChart3, Users, LogOut, Shield, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type SidebarProps = {
  currentView: string;
  onViewChange: (view: string) => void;
};

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { signOut, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'calendar', icon: Calendar, label: 'Календарь' },
    { id: 'properties', icon: Home, label: 'Объекты' },
    { id: 'bookings', icon: Users, label: 'Брони' },
    { id: 'analytics', icon: BarChart3, label: 'Аналитика' },
    { id: 'settings', icon: Settings, label: 'Настройки' },
  ];

  if (isAdmin) {
    menuItems.push({ id: 'admin', icon: Shield, label: 'Админ' });
  }

  const handleNavClick = (id: string) => {
    onViewChange(id);
    setIsOpen(false);
  };

  return (
    <>
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-slate-800 rounded-lg text-white"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-mobile-menu"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={`
        fixed md:relative inset-y-0 left-0 z-40
        w-64 bg-slate-900 border-r border-slate-800 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 md:p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 pl-8 md:pl-0">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-teal-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">Roomi</h1>
              <p className="text-slate-400 text-xs">Booking Manager</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 md:p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                data-testid={`nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium text-sm md:text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 md:p-4 border-t border-slate-800">
          <button
            onClick={() => signOut()}
            data-testid="button-signout"
            className="w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm md:text-base">Выйти</span>
          </button>
        </div>
      </div>
    </>
  );
}
