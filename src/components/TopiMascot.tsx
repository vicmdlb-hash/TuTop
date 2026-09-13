export default function TopiMascot({ className = 'h-10 w-10', title = 'Topi' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <linearGradient id="topi-cap" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#7C4DFF"/><stop offset="1" stopColor="#4B2EDB"/></linearGradient>
        <linearGradient id="topi-fur" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#986448"/><stop offset="1" stopColor="#4A2C20"/></linearGradient>
        <pattern id="topi-knit" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3c1.5-2.5 4.5-2.5 6 0M0 6c1.5-2.5 4.5-2.5 6 0" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth=".8" strokeLinecap="round"/></pattern>
        <filter id="topi-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#2E1065" floodOpacity=".22"/></filter>
      </defs>
      <g filter="url(#topi-shadow)">
        <ellipse cx="60" cy="88" rx="34" ry="28" fill="url(#topi-fur)"/>
        <ellipse cx="60" cy="89" rx="18" ry="24" fill="#DDB18C"/>
        <ellipse cx="60" cy="56" rx="31" ry="30" fill="url(#topi-fur)"/>
        <ellipse cx="60" cy="65" rx="20" ry="15" fill="#E3AD86"/>
        <ellipse cx="60" cy="65" rx="20" ry="15" fill="url(#topi-knit)" opacity=".25"/>
        <circle cx="47" cy="51" r="7.5" fill="#0F0F14"/><circle cx="73" cy="51" r="7.5" fill="#0F0F14"/>
        <circle cx="49" cy="48.5" r="2.3" fill="#fff"/><circle cx="75" cy="48.5" r="2.3" fill="#fff"/>
        <ellipse cx="60" cy="61" rx="6.5" ry="5" fill="#171116"/>
        <path d="M50 70c5 6 15 6 20 0" fill="none" stroke="#2B1710" strokeWidth="2.8" strokeLinecap="round"/>
        <path d="M56 70v7h4v-7M60 70v7h4v-7" fill="#fff"/>
        <ellipse cx="37" cy="89" rx="11" ry="16" fill="#5D382A"/><ellipse cx="83" cy="89" rx="11" ry="16" fill="#5D382A"/>
        <ellipse cx="37" cy="93" rx="6.5" ry="9" fill="#F0A99A"/><ellipse cx="83" cy="93" rx="6.5" ry="9" fill="#F0A99A"/>
        <circle cx="44" cy="78" r="7" fill="#6B402F"/><circle cx="76" cy="78" r="7" fill="#6B402F"/>
        <circle cx="44" cy="80" r="4" fill="#F0A99A"/><circle cx="76" cy="80" r="4" fill="#F0A99A"/>
      </g>
      <g filter="url(#topi-shadow)">
        <path d="M35 34c3-18 13-28 25-30 14 2 24 12 27 30-17-6-36-6-52 0Z" fill="url(#topi-cap)"/>
        <path d="M35 34c3-18 13-28 25-30 14 2 24 12 27 30-17-6-36-6-52 0Z" fill="url(#topi-knit)" opacity=".6"/>
        <rect x="35" y="29" width="52" height="12" rx="6" fill="#6D32E0"/>
        <rect x="35" y="29" width="52" height="12" rx="6" fill="url(#topi-knit)" opacity=".65"/>
        <circle cx="60" cy="5" r="6" fill="#6D32E0"/>
        <text x="60" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#FFF7ED">T</text>
      </g>
      <path d="M40 62 19 57M40 67 17 68M80 62l21-5M80 67l23 1" stroke="#F5D6C0" strokeWidth="2" strokeLinecap="round"/>
      <ellipse cx="60" cy="116" rx="38" ry="3" fill="#4B2EDB" opacity=".10"/>
    </svg>
  );
}
