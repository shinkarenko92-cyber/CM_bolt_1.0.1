/**
 * Renders AvitoErrorModal for errors pushed by showAvitoErrors() from avitoErrors service.
 * Must be mounted once in the app (e.g. in App.tsx).
 */
import { useAvitoErrorState } from '../services/avitoErrors';
import { AvitoErrorModal } from './AvitoErrorModal';

export function AvitoErrorQueue() {
  const state = useAvitoErrorState();
  if (!state) return null;
  return (
    <AvitoErrorModal
      isOpen={true}
      onClose={state.onClose}
      error={state.error}
    />
  );
}
