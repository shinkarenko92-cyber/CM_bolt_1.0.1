import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Property } from '../lib/supabase';
import { GripVertical } from 'lucide-react';

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

  // IMPORTANT:
  // `position: sticky` doesn't work inside an element that has a CSS transform.
  // DnD-kit applies transform even when it's effectively "zero", which breaks the fixed left column.
  // Only set transform when it's actually moving/scaling (e.g. while dragging).
  const hasActiveTransform =
    !!transform &&
    (transform.x !== 0 ||
      transform.y !== 0 ||
      transform.scaleX !== 1 ||
      transform.scaleY !== 1);

  const style: React.CSSProperties = {
    transform: hasActiveTransform ? CSS.Transform.toString(transform) : undefined,
    transition: hasActiveTransform ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Ensure the row container can expand to the full grid width; otherwise sticky gets constrained
      // by the parent's width and appears to "slide" right after some horizontal scrolling.
      className="flex min-w-max border-b border-slate-700 relative"
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
