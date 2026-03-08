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
}

const steps = [
  { id: 'properties', icon: Building2, key: 'addProperty' },
  { id: 'bookings', icon: Upload, key: 'importBookings' },
  { id: 'avito', icon: Globe, key: 'connectAvito' },
] as const;

export function OnboardingWizard({
  hasProperties,
  hasBookings,
  hasAvito,
  onGoToProperties,
}: OnboardingWizardProps) {
  const { t } = useTranslation();

  const stepStatus = {
    properties: hasProperties,
    bookings: hasBookings,
    avito: hasAvito,
  };

  const completedCount = Object.values(stepStatus).filter(Boolean).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="max-w-xl w-full">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">
            {t('onboarding.welcome', { defaultValue: 'Добро пожаловать в Roomi' })}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {t('onboarding.subtitle', { defaultValue: 'Настройте систему за 3 простых шага' })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full bg-muted rounded-full h-2 mb-6">
            <div
              className="bg-brand h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="space-y-3">
            <OnboardingStep
              number={1}
              icon={Building2}
              title={t('onboarding.step1Title', { defaultValue: 'Добавьте объект' })}
              description={t('onboarding.step1Desc', { defaultValue: 'Укажите квартиру, апартамент или дом' })}
              completed={stepStatus.properties}
              actionLabel={t('onboarding.addProperty', { defaultValue: 'Добавить объект' })}
              onAction={onGoToProperties}
            />

            <OnboardingStep
              number={2}
              icon={Upload}
              title={t('onboarding.step2Title', { defaultValue: 'Загрузите бронирования' })}
              description={t('onboarding.step2Desc', { defaultValue: 'Импортируйте из Excel или добавьте вручную' })}
              completed={stepStatus.bookings}
              actionLabel={t('onboarding.importExcel', { defaultValue: 'Загрузить Excel' })}
              link="/onboarding/import"
            />

            <OnboardingStep
              number={3}
              icon={Globe}
              title={t('onboarding.step3Title', { defaultValue: 'Подключите Avito' })}
              description={t('onboarding.step3Desc', { defaultValue: 'Синхронизируйте календарь и бронирования' })}
              completed={stepStatus.avito}
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

interface OnboardingStepProps {
  number: number;
  icon: typeof Building2;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  onAction?: () => void;
  link?: string;
  disabled?: boolean;
}

function OnboardingStep({ number, icon: Icon, title, description, completed, actionLabel, onAction, link, disabled }: OnboardingStepProps) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-lg border transition-colors',
      completed ? 'border-brand/30 bg-brand/5' : 'border-border'
    )}>
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
        completed ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
      )}>
        {completed ? <CheckCircle2 className="h-5 w-5" /> : number}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {!completed && (
        link ? (
          <Button asChild size="sm" variant="outline">
            <Link to={link}>{actionLabel}</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}
