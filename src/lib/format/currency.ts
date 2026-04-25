const CURRENCY_LOCALES: Record<string, string> = {
  GHS: 'en-GH',
  NGN: 'en-NG',
  KES: 'en-KE',
  ZAR: 'en-ZA',
  EGP: 'en-EG',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  INR: 'en-IN',
  CAD: 'en-CA',
  AUD: 'en-AU',
  CHF: 'de-CH',
  HKD: 'zh-HK',
  SGD: 'en-SG',
  NZD: 'en-NZ',
  MYR: 'ms-MY',
  IDR: 'id-ID',
  PHP: 'en-PH',
  THB: 'th-TH',
  KRW: 'ko-KR',
  TRY: 'tr-TR',
  RUB: 'ru-RU',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  AED: 'ar-AE',
  SAR: 'ar-SA',
  PKR: 'ur-PK',
  BDT: 'bn-BD',
};

export function formatCurrency(
  amount: number,
  currencyCode: string = 'GHS',
  options?: { compact?: boolean },
): string {
  const locale = CURRENCY_LOCALES[currencyCode] ?? 'en-US';
  try {
    if (options?.compact && Math.abs(amount) >= 1000) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(amount);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatCurrencyCompact(amount: number, currencyCode: string = 'GHS'): string {
  return formatCurrency(amount, currencyCode, { compact: true });
}
