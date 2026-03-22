/** Курсы конвертации в рубли (хардкод, централизованно) */
export const CURRENCY_RATES: Record<string, number> = {
  RUB: 1,
  EUR: 100,
  USD: 92,
};

export function convertToRUB(amount: number, currency: string): number {
  return amount * (CURRENCY_RATES[(currency ?? '').toUpperCase()] ?? 1);
}
