import '../brand092.css';

export default function TopiMascot({ className = 'h-10 w-10', title = 'Topi' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <linearGradient id="topi-cap" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9A75FF"/><stop offset=".5" stopColor="#7C4DFF"/><stop offset="1" stopColor="#4B2EDB"/></linearGradient>
        <linearGradient id="topi-fur" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#A87859"/><stop offset=".55" stopColor="#79503D"/><stop offset="1" stopColor="#4A2C20"/></linearGradient>
        <pattern id="topi-yarn-brown" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M-1 4C1 1 3 1 4 4S7 7 9 4" fill="none" stroke="#D1A085" strokeOpacity=".33" strokeWidth="1.25" strokeLinecap="round"/>
          <path d="M-1 8C1 5 3 5 4 8S7 11 9 8" fill="none" stroke="#3C241B" strokeOpacity=".24" strokeWidth="1.1" strokeLinecap="round"/>
        </pattern>
        <pattern id="topi-yarn-beige" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 3.5C1.6 1 3.8 1 5.4 3.5M1 7C2.4 4.7 4.6 4.7 6.2 7" fill="none" stroke="#FFF0DE" strokeOpacity=".38" strokeWidth="1" strokeLinecap="round"/>
        </pattern>
        <pattern id="topi-yarn-purple" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M-.5 3.5C1.4.8 4 .8 5.8 3.5S9 6.2 10 3.5" fill="none" stroke="#E7D8FF" strokeOpacity=".46" strokeWidth="1.15" strokeLinecap="round"/>
          <path d="M-.5 7C1.4 4.3 4 4.3 5.8 7" fill="none" stroke="#2E167C" strokeOpacity=".26" strokeWidth="1" strokeLinecap="round"/>
        </pattern>
        <filter id="topi-soft-yarn" x="-30%" y="-30%" width="160%" height="170%">
          <feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="2" seed="7" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
          <feDropShadow in="rough" dx="0" dy="3" stdDeviation="2.2" floodColor="#180B2C" floodOpacity=".30"/>
        </filter>
      </defs>

      <g filter="url(#topi-soft-yarn)">
        <ellipse cx="60" cy="89" rx="34" ry="27" fill="url(#topi-fur)" stroke="#3E271E" strokeWidth="2.4"/>
        <ellipse cx="60" cy="89" rx="34" ry="27" fill="url(#topi-yarn-brown)" opacity=".92"/>
        <ellipse cx="60" cy="90" rx="18" ry="23" fill="#DDB18C" stroke="#B98163" strokeWidth="1.8"/>
        <ellipse cx="60" cy="90" rx="18" ry="23" fill="url(#topi-yarn-beige)" opacity=".92"/>

        <ellipse cx="60" cy="56" rx="31" ry="30" fill="url(#topi-fur)" stroke="#3E271E" strokeWidth="2.4"/>
        <ellipse cx="60" cy="56" rx="31" ry="30" fill="url(#topi-yarn-brown)" opacity=".96"/>
        <ellipse cx="60" cy="65" rx="20" ry="15" fill="#E3AD86" stroke="#BC7D5C" strokeWidth="1.6"/>
        <ellipse cx="60" cy="65" rx="20" ry="15" fill="url(#topi-yarn-beige)" opacity=".9"/>

        <circle cx="47" cy="51" r="7.4" fill="#0F0F14" stroke="#33201A" strokeWidth="1.6"/>
        <circle cx="73" cy="51" r="7.4" fill="#0F0F14" stroke="#33201A" strokeWidth="1.6"/>
        <circle cx="49.2" cy="48.4" r="2.2" fill="#fff"/><circle cx="75.2" cy="48.4" r="2.2" fill="#fff"/>
        <ellipse cx="60" cy="61" rx="6.4" ry="5" fill="#171116"/>
        <path d="M50 70c5 6 15 6 20 0" fill="none" stroke="#2B1710" strokeWidth="2.6" strokeLinecap="round"/>
        <path d="M56 70v7h4v-7M60 70v7h4v-7" fill="#FFFDF8"/>

        <ellipse cx="37" cy="89" rx="11" ry="16" fill="#684333" stroke="#3E271E" strokeWidth="1.8"/>
        <ellipse cx="37" cy="89" rx="11" ry="16" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="83" cy="89" rx="11" ry="16" fill="#684333" stroke="#3E271E" strokeWidth="1.8"/>
        <ellipse cx="83" cy="89" rx="11" ry="16" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="37" cy="94" rx="6.5" ry="9" fill="#F0A99A" stroke="#CC7F78" strokeWidth="1.2"/>
        <ellipse cx="83" cy="94" rx="6.5" ry="9" fill="#F0A99A" stroke="#CC7F78" strokeWidth="1.2"/>
        <circle cx="44" cy="79" r="7" fill="#704735" stroke="#3E271E" strokeWidth="1.4"/>
        <circle cx="76" cy="79" r="7" fill="#704735" stroke="#3E271E" strokeWidth="1.4"/>
        <circle cx="44" cy="81" r="4" fill="#F0A99A"/><circle cx="76" cy="81" r="4" fill="#F0A99A"/>
      </g>

      <g filter="url(#topi-soft-yarn)">
        <path d="M35 34c3-18 13-28 25-30 14 2 24 12 27 30-17-6-36-6-52 0Z" fill="url(#topi-cap)" stroke="#3D1C9E" strokeWidth="2.2"/>
        <path d="M35 34c3-18 13-28 25-30 14 2 24 12 27 30-17-6-36-6-52 0Z" fill="url(#topi-yarn-purple)" opacity=".96"/>
        <rect x="34" y="29" width="54" height="13" rx="6.5" fill="#6D32E0" stroke="#3D1C9E" strokeWidth="1.8"/>
        <rect x="34" y="29" width="54" height="13" rx="6.5" fill="url(#topi-yarn-purple)" opacity=".98"/>
        <circle cx="60" cy="5.5" r="6.2" fill="#7140E8" stroke="#3D1C9E" strokeWidth="1.4"/>
        <circle cx="60" cy="5.5" r="6.2" fill="url(#topi-yarn-purple)"/>
        <text x="60" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#FFF7ED">T</text>
      </g>

      <path d="M40 62 19 57M40 67 17 68M80 62l21-5M80 67l23 1" stroke="#F5D6C0" strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 47c-4 2-7 5-8 8M92 47c4 2 7 5 8 8" fill="none" stroke="#B68169" strokeWidth="1.4" strokeLinecap="round" opacity=".65"/>
      <ellipse cx="60" cy="116" rx="38" ry="3" fill="#4B2EDB" opacity=".12"/>
    </svg>
  );
}
