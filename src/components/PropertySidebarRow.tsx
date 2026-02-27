import { ChevronDown, ChevronRight } from 'lucide-react';
import { Property } from '@/lib/supabase';

type PropertySidebarRowProps = {
  property: Property;
  isExpanded: boolean;
  onToggle: () => void;
};

export function PropertySidebarRow({ property, isExpanded, onToggle }: PropertySidebarRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 border-b border-slate-700 hover:bg-slate-800/50 transition-colors cursor-pointer"
      style={{ height: '102px' }}
      onClick={onToggle}
    >
      <button className="text-slate-400 hover:text-slate-300 flex-shrink-0">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white leading-tight">
          {property.name} <span className="text-xs text-slate-400 font-normal">{property.type}</span>
        </div>
      </div>
    </div>
  );
}
