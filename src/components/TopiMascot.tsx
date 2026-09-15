import '../brand092.css';

export default function TopiMascot({ className = 'h-10 w-10', title = 'Topi' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <linearGradient id="topi-cap" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#A986FF"/><stop offset=".5" stopColor="#7C4DFF"/><stop offset="1" stopColor="#4B2EDB"/></linearGradient>
        <linearGradient id="topi-fur" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#AE7E60"/><stop offset=".55" stopColor="#79503D"/><stop offset="1" stopColor="#4A2C20"/></linearGradient>
        <pattern id="topi-yarn-brown" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M-1 3.5C.8.8 3.2.8 4.8 3.5S8.2 6.2 10 3.5" fill="none" stroke="#E5B79D" strokeOpacity=".44" strokeWidth="1.35" strokeLinecap="round"/>
          <path d="M-1 7C.8 4.3 3.2 4.3 4.8 7S8.2 9.7 10 7" fill="none" stroke="#321D16" strokeOpacity=".28" strokeWidth="1.1" strokeLinecap="round"/>
        </pattern>
        <pattern id="topi-yarn-beige" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M-1 3.5C1 .9 3.6.9 5.4 3.5S8.4 6.1 10 3.5" fill="none" stroke="#FFF4E7" strokeOpacity=".58" strokeWidth="1.25" strokeLinecap="round"/>
          <path d="M-.5 7C1.2 4.5 3.8 4.5 5.6 7" fill="none" stroke="#A66E55" strokeOpacity=".24" strokeWidth="1" strokeLinecap="round"/>
        </pattern>
        <pattern id="topi-yarn-purple" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M-1 3C.7.6 3 .6 4.5 3S7.7 5.4 9 3" fill="none" stroke="#F0E5FF" strokeOpacity=".64" strokeWidth="1.15" strokeLinecap="round"/>
          <path d="M-1 6C.7 3.6 3 3.6 4.5 6" fill="none" stroke="#2E167C" strokeOpacity=".32" strokeWidth=".95" strokeLinecap="round"/>
        </pattern>
        <filter id="topi-soft-yarn" x="-35%" y="-35%" width="170%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency=".065" numOctaves="3" seed="11" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.1" xChannelSelector="R" yChannelSelector="G" result="rough"/>
          <feDropShadow in="rough" dx="0" dy="3" stdDeviation="2.4" floodColor="#180B2C" floodOpacity=".34"/>
        </filter>
      </defs>

      <g filter="url(#topi-soft-yarn)">
        <ellipse cx="60" cy="88" rx="34" ry="28" fill="url(#topi-fur)" stroke="#3E271E" strokeWidth="2.3"/>
        <ellipse cx="60" cy="88" rx="33" ry="27" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="60" cy="90" rx="18" ry="22" fill="#DDB18C" stroke="#B98163" strokeWidth="1.7"/>
        <ellipse cx="60" cy="90" rx="17" ry="21" fill="url(#topi-yarn-beige)"/>

        <ellipse cx="60" cy="56" rx="31" ry="30" fill="url(#topi-fur)" stroke="#3E271E" strokeWidth="2.3"/>
        <ellipse cx="60" cy="56" rx="30" ry="29" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="60" cy="65" rx="20" ry="15" fill="#E3AD86" stroke="#BC7D5C" strokeWidth="1.6"/>
        <ellipse cx="60" cy="65" rx="19" ry="14" fill="url(#topi-yarn-beige)"/>

        <ellipse cx="36" cy="88" rx="10.5" ry="16" fill="#684333" stroke="#3E271E" strokeWidth="1.7"/>
        <ellipse cx="36" cy="88" rx="10" ry="15" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="84" cy="88" rx="10.5" ry="16" fill="#684333" stroke="#3E271E" strokeWidth="1.7"/>
        <ellipse cx="84" cy="88" rx="10" ry="15" fill="url(#topi-yarn-brown)"/>
        <ellipse cx="36" cy="94" rx="6.3" ry="8.8" fill="#F0A99A" stroke="#CC7F78" strokeWidth="1.1"/>
        <ellipse cx="84" cy="94" rx="6.3" ry="8.8" fill="#F0A99A" stroke="#CC7F78" strokeWidth="1.1"/>

        <circle cx="47" cy="51" r="7.2" fill="#0F0F14" stroke="#33201A" strokeWidth="1.5"/>
        <circle cx="73" cy="51" r="7.2" fill="#0F0F14" stroke="#33201A" strokeWidth="1.5"/>
        <circle cx="49.2" cy="48.4" r="2.1" fill="#fff"/><circle cx="75.2" cy="48.4" r="2.1" fill="#fff"/>
        <ellipse cx="60" cy="61" rx="6.2" ry="4.9" fill="#171116"/>
        <path d="M50 70c5 6 15 6 20 0" fill="none" stroke="#2B1710" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M56 70v7h4v-7M60 70v7h4v-7" fill="#FFFDF8"/>
      </g>

      <g id="topi-crochet-stitches" fill="none" strokeLinecap="round">
        <path d="M40 39c4-2 8-3 12-3M68 36c4 0 8 1 12 3M35 56c3-2 6-3 9-4M76 52c4 1 7 2 10 4M43 82c4-2 8-3 12-3M66 79c4 0 8 1 12 3M49 99c7 3 15 3 22 0" stroke="#F1C5A9" strokeOpacity=".54" strokeWidth="1.4"/>
        <path d="M44 42c3 2 5 4 6 7M70 42c-3 2-5 4-6 7M48 86c2 4 3 8 3 12M72 86c-2 4-3 8-3 12" stroke="#3B2219" strokeOpacity=".36" strokeWidth="1.15"/>
      </g>

      <g filter="url(#topi-soft-yarn)">
        <path d="M34 34c3-18 14-28 26-30 15 2 25 12 28 30-18-6-37-6-54 0Z" fill="url(#topi-cap)" stroke="#3D1C9E" strokeWidth="2.1"/>
        <path d="M34 34c3-18 14-28 26-30 15 2 25 12 28 30-18-6-37-6-54 0Z" fill="url(#topi-yarn-purple)"/>
        <rect x="33" y="29" width="56" height="13" rx="6.5" fill="#6D32E0" stroke="#3D1C9E" strokeWidth="1.7"/>
        <rect x="33" y="29" width="56" height="13" rx="6.5" fill="url(#topi-yarn-purple)"/>
        <circle cx="60" cy="5.5" r="6.3" fill="#7140E8" stroke="#3D1C9E" strokeWidth="1.3"/>
        <circle cx="60" cy="5.5" r="6.1" fill="url(#topi-yarn-purple)"/>
        <path d="M40 32h40M42 36h36" stroke="#EAD9FF" strokeOpacity=".52" strokeWidth="1.2" strokeDasharray="2.4 2.2"/>
        <text x="60" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#FFF7ED">T</text>
      </g>

      <path d="M40 62 19 57M40 67 17 68M80 62l21-5M80 67l23 1" stroke="#F5D6C0" strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 47c-4 2-7 5-8 8M92 47c4 2 7 5 8 8" fill="none" stroke="#B68169" strokeWidth="1.4" strokeLinecap="round" opacity=".65"/>
      <path d="M89 23c7 2 11 7 12 13 1 6-2 10-8 12" fill="none" stroke="#B788FF" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2" opacity=".72"/>
      <ellipse cx="60" cy="116" rx="38" ry="3" fill="#4B2EDB" opacity=".12"/>
    </svg>
  );
}