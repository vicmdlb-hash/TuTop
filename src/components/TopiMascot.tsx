export default function TopiMascot({ className = 'h-10 w-10', title = 'Topi' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label={title}>
      <defs>
        <linearGradient id="topi-bg" x1="18" y1="12" x2="78" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id="topi-fur" x1="32" y1="30" x2="64" y2="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9B6A48" />
          <stop offset="1" stopColor="#4B2D20" />
        </linearGradient>
        <pattern id="topi-knit" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 2.5c1.2-2 3.8-2 5 0M0 5c1.2-2 3.8-2 5 0" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth=".75" strokeLinecap="round" />
        </pattern>
        <filter id="topi-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#2E1065" floodOpacity=".24" />
        </filter>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#topi-bg)" />
      <g filter="url(#topi-soft)">
        <ellipse cx="48" cy="58" rx="29" ry="27" fill="url(#topi-fur)" />
        <ellipse cx="48" cy="58" rx="29" ry="27" fill="url(#topi-knit)" opacity=".48" />
        <ellipse cx="48" cy="65" rx="19" ry="14" fill="#D8A17B" />
        <ellipse cx="48" cy="65" rx="19" ry="14" fill="url(#topi-knit)" opacity=".28" />
        <circle cx="37" cy="51" r="6.5" fill="#15111A" />
        <circle cx="59" cy="51" r="6.5" fill="#15111A" />
        <circle cx="39" cy="49" r="2" fill="white" />
        <circle cx="61" cy="49" r="2" fill="white" />
        <ellipse cx="48" cy="60" rx="6" ry="4.5" fill="#1F1720" />
        <path d="M40 69c4 5 12 5 16 0" fill="none" stroke="#2B1710" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M44 69v5h4v-5M48 69v5h4v-5" fill="#F8FAFC" />
      </g>
      <g filter="url(#topi-soft)">
        <path d="M28 36c2-13 9-23 20-25 12 2 19 12 21 25-13-4-28-4-41 0Z" fill="#6D28D9" />
        <path d="M28 36c2-13 9-23 20-25 12 2 19 12 21 25-13-4-28-4-41 0Z" fill="url(#topi-knit)" opacity=".72" />
        <rect x="28" y="31" width="40" height="10" rx="5" fill="#7C3AED" />
        <rect x="28" y="31" width="40" height="10" rx="5" fill="url(#topi-knit)" opacity=".75" />
        <circle cx="48" cy="10" r="5" fill="#7C3AED" />
        <circle cx="48" cy="10" r="5" fill="url(#topi-knit)" opacity=".8" />
        <text x="48" y="30" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="900" fill="#FFF7ED">T</text>
      </g>
      <path d="M28 61 13 57M28 66 12 67M68 61l15-4M68 66l16 1" stroke="#F5D6C0" strokeWidth="1.8" strokeLinecap="round" opacity=".95" />
      <circle cx="25" cy="72" r="5" fill="#B77968" />
      <circle cx="71" cy="72" r="5" fill="#B77968" />
      <circle cx="25" cy="72" r="5" fill="url(#topi-knit)" opacity=".42" />
      <circle cx="71" cy="72" r="5" fill="url(#topi-knit)" opacity=".42" />
    </svg>
  );
}
