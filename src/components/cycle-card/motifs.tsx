export function SankofaMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <path d="M 0,-42 C -21,-42 -42,-27 -42,-5 C -42,10 -31,23 -21,31 C -11,39 0,45 0,45 C 0,45 11,39 21,31 C 31,23 42,10 42,-5 C 42,-27 21,-42 0,-42 Z" fill="none" stroke={color} strokeWidth="2.2"/>
        <path d="M 0,-29 C -13,-29 -26,-19 -26,-5 C -26,5 -18,12 -8,12 C -2,12 0,9 0,5 C 0,0 -4,-2 -7,-2" fill="none" stroke={color} strokeWidth="1.6"/>
        <path d="M 0,-29 C 13,-29 26,-19 26,-5 C 26,5 18,12 8,12 C 2,12 0,9 0,5 C 0,0 4,-2 7,-2" fill="none" stroke={color} strokeWidth="1.6"/>
        <line x1="0" y1="-42" x2="0" y2="-29" stroke={color} strokeWidth="1.6"/>
        <line x1="0" y1="15" x2="0" y2="31" stroke={color} strokeWidth="1.6"/>
        <circle cx="0" cy="-5" r="2.5" fill={color}/>
      </g>
    </svg>
  );
}

export function GyeNyameMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.72 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <line x1="0" y1="-44" x2="0" y2="44" stroke={color} strokeWidth="2"/>
        <path d="M 0,-42 C -18,-42 -33,-30 -33,-12 C -33,0 -22,8 -12,8 C -3,8 3,3 3,-6 C 3,-13 -2,-17 -7,-17 C -10,-17 -11,-15 -11,-12" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M 0,40 C 18,40 33,28 33,10 C 33,-2 22,-12 12,-12 C 3,-12 -3,-5 -3,3 C -3,10 2,14 7,14 C 10,14 11,12 11,10" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
        <line x1="-9" y1="-33" x2="9" y2="-33" stroke={color} strokeWidth="1.5"/>
        <line x1="-9" y1="33" x2="9" y2="33" stroke={color} strokeWidth="1.5"/>
      </g>
    </svg>
  );
}

export function AdinkraheneMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.75 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <circle cx="0" cy="0" r="44" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="30" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="16" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="3.5" fill={color}/>
      </g>
    </svg>
  );
}

export function CopperMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMaxYMin slice"
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.6 }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth="1.4">
        <path d="M 100,0 A 90 90 0 0 0 0,50"/>
        <path d="M 100,15 A 80 80 0 0 0 8,62"/>
        <path d="M 100,30 A 70 70 0 0 0 18,72"/>
        <path d="M 100,45 A 60 60 0 0 0 32,80"/>
        <path d="M 100,60 A 50 50 0 0 0 48,85"/>
      </g>
    </svg>
  );
}

export function EmeraldMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 50"
      preserveAspectRatio="none"
      className="absolute left-0 right-0"
      style={{ top: '30%', width: '100%', height: '40%', opacity: 0.5 }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth="0.8">
        <path d="M 0,10 Q 10,5 20,10 T 40,10 T 60,10 T 80,10 T 100,10"/>
        <path d="M 0,20 Q 10,15 20,20 T 40,20 T 60,20 T 80,20 T 100,20"/>
        <path d="M 0,30 Q 10,25 20,30 T 40,30 T 60,30 T 80,30 T 100,30"/>
        <path d="M 0,40 Q 10,35 20,40 T 40,40 T 60,40 T 80,40 T 100,40"/>
      </g>
    </svg>
  );
}

export function AmberMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMaxYMin slice"
      className="absolute"
      style={{ right: 0, top: 0, width: '50%', height: '100%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g fill={color}>
        <circle cx="40" cy="15" r="1.5"/>
        <circle cx="60" cy="8" r="2"/>
        <circle cx="75" cy="18" r="1"/>
        <circle cx="85" cy="12" r="2.5"/>
        <circle cx="95" cy="22" r="1.2"/>
        <circle cx="50" cy="32" r="1.5"/>
        <circle cx="72" cy="28" r="2"/>
        <circle cx="88" cy="36" r="1"/>
        <circle cx="42" cy="48" r="1.5"/>
        <circle cx="68" cy="52" r="1.2"/>
        <circle cx="90" cy="47" r="1.8"/>
        <circle cx="58" cy="68" r="2"/>
        <circle cx="82" cy="72" r="1.2"/>
      </g>
      <g transform="translate(85, 12)" fill={color}>
        <path d="M 0,-4 L 1,-1 L 4,0 L 1,1 L 0,4 L -1,1 L -4,0 L -1,-1 Z"/>
      </g>
    </svg>
  );
}

export function ObsidianMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '30%', height: '70%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <path
          d="M 0,0 m 0,-44 a 44,44 0 1,1 -0.1,0 M 0,-34 a 34,34 0 1,1 -0.1,0 M 0,-24 a 24,24 0 1,1 -0.1,0 M 0,-14 a 14,14 0 1,1 -0.1,0 M 0,-6 a 6,6 0 1,1 -0.1,0"
          fill="none" stroke={color} strokeWidth="1.6"
        />
        <circle cx="0" cy="0" r="2" fill={color}/>
      </g>
    </svg>
  );
}

export const MOTIF_COMPONENTS: Record<string, ({ color }: { color: string }) => React.ReactElement> = {
  sankofa: SankofaMotif,
  gye_nyame: GyeNyameMotif,
  adinkrahene: AdinkraheneMotif,
  copper: CopperMotif,
  emerald: EmeraldMotif,
  amber: AmberMotif,
  obsidian: ObsidianMotif,
};
