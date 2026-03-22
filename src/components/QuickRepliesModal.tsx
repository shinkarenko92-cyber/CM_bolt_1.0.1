import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageTemplate } from '@/hooks/useMessageTemplates';

interface QuickRepliesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: MessageTemplate[];
  onAdd: (label: string, text: string) => void;
  onUpdate: (id: string, label: string, text: string) => void;
  onDelete: (id: string) => void;
}

export function QuickRepliesModal({
  open,
  onOpenChange,
  templates,
  onAdd,
  onUpdate,
  onDelete,
}: QuickRepliesModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editText, setEditText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  const startEdit = (t: MessageTemplate) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditText(t.text);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel('');
    setEditText('');
  };

  const saveEdit = () => {
    if (!editingId || !editLabel.trim() || !editText.trim()) return;
    onUpdate(editingId, editLabel, editText);
    cancelEdit();
  };

  const startAdd = () => {
    setIsAdding(true);
    setNewLabel('');
    setNewText('');
    cancelEdit();
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setNewLabel('');
    setNewText('');
  };

  const saveAdd = () => {
    if (!newLabel.trim() || !newText.trim()) return;
    onAdd(newLabel, newText);
    cancelAdd();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Быстрые ответы</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
          {templates.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <input
                  autoFocus
                  className="w-full text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Название шаблона"
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                />
                <textarea
                  rows={3}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                  placeholder="Текст шаблона"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                    <X className="w-3 h-3 mr-1" /> Отмена
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={!editLabel.trim() || !editText.trim()}>
                    <Check className="w-3 h-3 mr-1" /> Сохранить
                  </Button>
                </div>
              </div>
            ) : (
              <div key={t.id} className="rounded-lg border border-border p-3 flex items-start gap-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.text}</p>
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(t.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}

          {templates.length === 0 && !isAdding && (
            <p className="text-sm text-muted-foreground text-center py-6">Нет шаблонов. Добавьте первый!</p>
          )}

          {isAdding && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <input
                autoFocus
                className="w-full text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Название шаблона (напр. «Приветствие»)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
              />
              <textarea
                rows={3}
                className="w-full text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                placeholder="Текст ответа. Используйте {{price}}, {{currency}} для подстановки."
                value={newText}
                onChange={e => setNewText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelAdd}>
                  <X className="w-3 h-3 mr-1" /> Отмена
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={saveAdd} disabled={!newLabel.trim() || !newText.trim()}>
                  <Check className="w-3 h-3 mr-1" /> Добавить
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border">
          <Button variant="outline" size="sm" className="w-full" onClick={startAdd} disabled={isAdding}>
            <Plus className="w-4 h-4 mr-1.5" /> Добавить шаблон
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
