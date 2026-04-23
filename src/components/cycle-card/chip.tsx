export function EmvChip({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <svg width="42" height="32" viewBox="-18 -14 36 28" aria-hidden="true">
      <rect x="-18" y="-14" width="36" height="28" rx="4" fill={primary}/>
      <rect x="-15" y="-11" width="30" height="22" rx="2" fill={secondary}/>
      <line x1="-15" y1="-5" x2="-3" y2="-5" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="-5" x2="15" y2="-5" stroke={primary} strokeWidth="1"/>
      <line x1="-15" y1="0" x2="-3" y2="0" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="0" x2="15" y2="0" stroke={primary} strokeWidth="1"/>
      <line x1="-15" y1="5" x2="-3" y2="5" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="5" x2="15" y2="5" stroke={primary} strokeWidth="1"/>
      <line x1="-3" y1="-11" x2="-3" y2="11" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="-11" x2="3" y2="11" stroke={primary} strokeWidth="1"/>
    </svg>
  );
}
