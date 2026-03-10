import { Link } from 'react-router-dom';
import { Building2, Upload, Globe, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface OnboardingWizardProps {
  hasProperties: boolean;
  hasBookings: boolean;
  hasAvito: boolean;
  onGoToProperties: () => void;
  /** Открыть экран добавления объекта и модалку добавления */
  onAddProperty: () => void;
}

export function OnboardingWizard({
  hasProperties,
  hasBookings,
  hasAvito,
  onGoToProperties,
  onAddProperty,
}: OnboardingWizardProps) {
  const { t } = useTranslation();

  const hasObjects = hasProperties || hasBookings;
  const progress = hasAvito ? 100 : hasObjects ? 50 : 0;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="max-w-xl w-full">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">
            {t('onboarding.welcome', { defaultValue: 'Добро пожаловать в Roomi' })}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {t('onboarding.subtitleChoice', { defaultValue: 'Выберите, как настроить объекты' })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full bg-muted rounded-full h-2 mb-6">
            <div
              className="bg-brand h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Выбор: добавить объект сам или загрузить бронирования */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('onboarding.choiceLabel', { defaultValue: 'Как начать?' })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
              <OnboardingChoiceCard
                icon={Building2}
                title={t('onboarding.choiceAddObject', { defaultValue: 'Добавить объект вручную' })}
                description={t('onboarding.choiceAddObjectDesc', { defaultValue: 'Укажите квартиру, апартамент или дом' })}
                actionLabel={t('onboarding.addProperty', { defaultValue: 'Добавить объект' })}
                completed={hasProperties}
                onClick={onAddProperty}
              />
              <OnboardingChoiceCard
                icon={Upload}
                title={t('onboarding.choiceUploadBookings', { defaultValue: 'Загрузить бронирования' })}
                description={t('onboarding.choiceUploadBookingsDesc', { defaultValue: 'Мы создадим объекты из вашего Excel' })}
                actionLabel={t('onboarding.importExcel', { defaultValue: 'Загрузить Excel' })}
                completed={hasBookings}
                link="/onboarding/import"
              />
            </div>
          </div>

          {/* Дальше: подключение Avito и других площадок */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
              {t('onboarding.thenConnect', { defaultValue: 'Затем подключите площадки' })}
            </p>
            <OnboardingStep
              icon={Globe}
              title={t('onboarding.step3Title', { defaultValue: 'Подключите Avito и другие' })}
              description={t('onboarding.step3Desc', { defaultValue: 'Синхронизируйте календарь и бронирования' })}
              completed={hasAvito}
              actionLabel={t('onboarding.connectAvito', { defaultValue: 'Подключить' })}
              onAction={onGoToProperties}
              disabled={!hasProperties}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface OnboardingChoiceCardProps {
  icon: typeof Building2;
  title: string;
  description: string;
  actionLabel: string;
  completed: boolean;
  onClick?: () => void;
  link?: string;
}

function OnboardingChoiceCard({ icon: Icon, title, description, actionLabel, completed, onClick, link }: OnboardingChoiceCardProps) {
  const content = (
    <div className={cn(
      'flex flex-col gap-3 p-4 rounded-lg border transition-colors h-full',
      completed ? 'border-brand/30 bg-brand/5' : 'border-border hover:border-muted-foreground/30'
    )}>
      <div className="flex items-start gap-3 flex-1 min-h-0">
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          completed ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
        )}>
          {completed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground text-sm">{title}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {!completed && (
        <div className="mt-auto pt-1">
          {link ? (
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link to={link}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={onClick}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
  return content;
}

interface OnboardingStepProps {
  icon: typeof Building2;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  onAction?: () => void;
  disabled?: boolean;
}

function OnboardingStep({ icon: Icon, title, description, completed, actionLabel, onAction, disabled }: OnboardingStepProps) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-lg border transition-colors',
      completed ? 'border-brand/30 bg-brand/5' : 'border-border'
    )}>
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        completed ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
      )}>
        {completed ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">{title}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {!completed && (
        <Button size="sm" variant="outline" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
