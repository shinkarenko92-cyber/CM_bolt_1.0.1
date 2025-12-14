import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Property, PropertyGroup } from '../lib/supabase';
import { GripVertical, ChevronDown, ChevronRight } from 'lucide-react';

type SortablePropertyRowProps = {
  property: Property;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  totalRowHeight: number;
  groups?: PropertyGroup[];
  onMoveToGroup?: (propertyId: string, groupId: string | null) => void;
};

export function SortablePropertyRow({
  property,
  isExpanded,
  onToggle,
  children,
  totalRowHeight,
  groups = [],
  onMoveToGroup,
}: SortablePropertyRowProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex border-b border-slate-700 relative"
      onContextMenu={handleContextMenu}
    >
      {showContextMenu && onMoveToGroup && (
        <div
          ref={contextMenuRef}
          className="absolute left-64 top-0 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 min-w-[200px]"
          style={{ top: '0px' }}
        >
          <div className="text-xs text-slate-400 mb-2 px-2">Переместить в группу:</div>
          <button
            onClick={() => {
              onMoveToGroup(property.id, null);
              setShowContextMenu(false);
            }}
            className="w-full text-left px-2 py-1 text-sm text-white hover:bg-slate-700 rounded"
          >
            Без группы
          </button>
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => {
                onMoveToGroup(property.id, group.id);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-2 py-1 text-sm text-white hover:bg-slate-700 rounded"
            >
              {group.name}
            </button>
          ))}
        </div>
      )}
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
