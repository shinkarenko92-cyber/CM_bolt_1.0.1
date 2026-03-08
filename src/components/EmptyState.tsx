import { type ReactNode } from 'react';
import { PackageOpen, Search, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type EmptyStateVariant = 'no-data' | 'no-results' | 'error';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const variantIcons: Record<EmptyStateVariant, ReactNode> = {
  'no-data': <PackageOpen className="h-12 w-12 text-muted-foreground/50" />,
  'no-results': <Search className="h-12 w-12 text-muted-foreground/50" />,
  'error': <AlertTriangle className="h-12 w-12 text-destructive/50" />,
};

export function EmptyState({
  variant = 'no-data',
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4">
          {icon ?? variantIcons[variant]}
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
        )}
        {actionLabel && onAction && (
          <Button onClick={onAction} variant={variant === 'error' ? 'destructive' : 'default'}>
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
