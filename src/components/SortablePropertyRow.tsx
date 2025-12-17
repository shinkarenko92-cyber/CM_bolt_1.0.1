import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Property } from '../lib/supabase';
import { GripVertical, ChevronDown, ChevronRight } from 'lucide-react';

type SortablePropertyRowProps = {
  property: Property;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  totalRowHeight: number;
};

export function SortablePropertyRow({
  property,
  isExpanded,
  onToggle,
  children,
  totalRowHeight,
}: SortablePropertyRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: property.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex border-b border-slate-700 relative"
    >
      <div 
        className="w-64 flex-shrink-0 sticky left-0 z-30 bg-slate-800 border-r border-slate-700 flex items-center px-4 gap-2"
        style={{ height: `${totalRowHeight}px` }}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 text-slate-400 hover:text-slate-300 transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        
        <button 
          className="text-slate-400 hover:text-slate-300 flex-shrink-0"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white leading-tight truncate">
            {property.name}
          </div>
          <div className="text-xs text-slate-400">
            {property.type}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
