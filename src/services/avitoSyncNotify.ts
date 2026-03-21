import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { syncAvitoIntegration } from '@/services/apiSync';
import { showAvitoErrors, type AvitoErrorInfo } from '@/services/avitoErrors';

interface SyncOptions {
  /** Exclude this booking ID from the Avito calendar sync (used when deleting a manual booking). */
  excludeBookingId?: string;
  /** Label used in console.error for easier log tracing. */
  context?: string;
}

/**
 * Syncs one or more properties with Avito and shows toast notifications.
 * Handles success/warning/error states and silently skips when no integration is configured.
 */
export async function syncAvitoWithNotify(
  propertyIds: string | string[],
  t: TFunction,
  options: SyncOptions = {}
): Promise<void> {
  const ids = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
  if (ids.length === 0) return;

  const toastId = toast.loading('Синхронизация с Avito...');

  try {
    let anySuccess = false;
    let lastResult: Awaited<ReturnType<typeof syncAvitoIntegration>> | null = null;

    for (const propertyId of ids) {
      const result = await syncAvitoIntegration(propertyId, options.excludeBookingId);
      lastResult = result;
      if (result.success) anySuccess = true;
    }

    toast.dismiss(toastId);

    if (anySuccess && lastResult) {
      if (lastResult.pricesSuccess && lastResult.intervalsFailed) {
        toast.success(t('avito.sync.pricesUpdated', { defaultValue: 'Цены обновлены в Avito' }));
        toast(t('avito.sync.partialCalendarWarning', { defaultValue: 'Часть календаря Avito пока не обновлена. Повтори синхронизацию позже.' }), {
          icon: '⚠️',
          duration: 6000,
        });
      } else {
        toast.success('Синхронизация с Avito успешна! Даты, цены и брони обновлены 🚀');
      }
      if (lastResult.warnings?.length || lastResult.warningMessage) {
        toast(
          lastResult.warningMessage ||
          lastResult.warnings?.map(w => w.message).join(' ') ||
          'Есть предупреждения по Avito',
          { icon: '⚠️', duration: 6000 }
        );
      }
    } else if (lastResult && !lastResult.skipUserError) {
      if (lastResult.errors && lastResult.errors.length > 0) {
        const errorMessages = lastResult.errors.map(e => e.message || 'Ошибка').join(', ');
        toast.error(`Ошибка синхронизации: ${errorMessages}`);
        showAvitoErrors(lastResult.errors as AvitoErrorInfo[], t).catch(err => {
          console.error('Error showing Avito error modals:', err);
        });
      } else {
        toast.error(lastResult.message || 'Ошибка синхронизации с Avito');
      }
      if (options.context) {
        console.error(`${options.context}: Avito sync failed`, lastResult);
      }
    }
    // else: skipUserError — silent, no integration configured
  } catch (error) {
    toast.dismiss(toastId);
    console.error(`${options.context ?? 'syncAvitoWithNotify'}: Unexpected error`, error);
    toast.error('Ошибка синхронизации с Avito');
  }
}
