import { ChevronDown, ChevronRight } from 'lucide-react';
import { Property } from '../lib/supabase';

type PropertySidebarRowProps = {
  property: Property;
  isExpanded: boolean;
  onToggle: () => void;
};

export function PropertySidebarRow({ property, isExpanded, onToggle }: PropertySidebarRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 hover:bg-slate-800/50 transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <button className="text-slate-400 hover:text-slate-300">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{property.name}</div>
        <div className="text-xs text-slate-400 truncate">{property.type}</div>
      </div>
    </div>
  );
}
