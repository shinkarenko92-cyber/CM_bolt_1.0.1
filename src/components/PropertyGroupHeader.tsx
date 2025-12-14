import { GripVertical, Home, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { PropertyGroup } from '../lib/supabase';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type PropertyGroupHeaderProps = {
  group: PropertyGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  propertiesCount: number;
};

export function PropertyGroupHeader({
  group,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  propertiesCount,
}: PropertyGroupHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-teal-600 text-white border-b border-teal-700 flex items-center px-4 gap-2 h-12 sticky top-0 z-40"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex-shrink-0 text-teal-200 hover:text-white transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      
      <button
        onClick={onToggle}
        className="flex-shrink-0 text-teal-200 hover:text-white transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      
      <Home className="w-4 h-4 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight truncate">
          {group.name}
        </div>
        <div className="text-xs text-teal-200">
          {propertiesCount} {propertiesCount === 1 ? 'объект' : 'объектов'}
        </div>
      </div>
      
      <button
        onClick={onEdit}
        className="flex-shrink-0 p-1 text-teal-200 hover:text-white hover:bg-teal-700 rounded transition-colors"
        title="Редактировать группу"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1 text-teal-200 hover:text-red-300 hover:bg-teal-700 rounded transition-colors"
        title="Удалить группу"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
