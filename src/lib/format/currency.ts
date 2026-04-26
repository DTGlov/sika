const CURRENCY_LOCALES: Record<string, string> = {
  GHS: "en-GH",
  NGN: "en-NG",
  KES: "en-KE",
  ZAR: "en-ZA",
  EGP: "en-EG",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CNY: "zh-CN",
  INR: "en-IN",
  CAD: "en-CA",
  AUD: "en-AU",
  CHF: "de-CH",
  HKD: "zh-HK",
  SGD: "en-SG",
  NZD: "en-NZ",
  MYR: "ms-MY",
  IDR: "id-ID",
  PHP: "en-PH",
  THB: "th-TH",
  KRW: "ko-KR",
  TRY: "tr-TR",
  RUB: "ru-RU",
  BRL: "pt-BR",
  MXN: "es-MX",
  AED: "ar-AE",
  SAR: "ar-SA",
  PKR: "ur-PK",
  BDT: "bn-BD",
};

export function formatCurrency(
  amount: number,
  currencyCode: string = "GHS",
  options?: { compact?: boolean },
): string {
  const locale = CURRENCY_LOCALES[currencyCode] ?? "en-US";
  // GHS renders as "GH₵" with narrowSymbol — use 'code' to get the clean "GHS" prefix instead
  const currencyDisplay = currencyCode === "GHS" ? "code" : "narrowSymbol";
  try {
    let formatted: string;
    if (options?.compact && Math.abs(amount) >= 1000) {
      formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currencyCode,
        currencyDisplay,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount);
    } else {
      formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currencyCode,
        currencyDisplay,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    // Intl emits U+00A0 (non-breaking space) between code and number — normalize to regular space
    return formatted.replace(/\u00A0/g, " ");
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatCurrencyCompact(
  amount: number,
  currencyCode: string = "GHS",
): string {
  return formatCurrency(amount, currencyCode, { compact: true });
}

export function formatAmountCompact(
  amount: number,
  currencyCode: string = "GHS",
): string {
  const locale = CURRENCY_LOCALES[currencyCode] ?? "en-US";
  try {
    if (Math.abs(amount) >= 1000) {
      return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount);
    }
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function currencySymbol(currencyCode: string = "GHS"): string {
  // GHS displays as the ISO code throughout the app — match the formatter
  if (currencyCode === "GHS") return "GHS";
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find(p => p.type === "currency")?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}
