export default function TopiMascot({ className = 'h-10 w-10', title = 'Topi' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label={title}>
      <defs>
        <linearGradient id="topi-bg" x1="18" y1="12" x2="78" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id="topi-fur" x1="32" y1="30" x2="64" y2="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5E3C" />
          <stop offset="1" stopColor="#4B2D20" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#topi-bg)" />
      <ellipse cx="48" cy="58" rx="29" ry="27" fill="url(#topi-fur)" />
      <ellipse cx="48" cy="64" rx="19" ry="14" fill="#C98E63" />
      <circle cx="37" cy="51" r="6.5" fill="#111827" />
      <circle cx="59" cy="51" r="6.5" fill="#111827" />
      <circle cx="39" cy="49" r="2" fill="white" />
      <circle cx="61" cy="49" r="2" fill="white" />
      <ellipse cx="48" cy="60" rx="6" ry="4.5" fill="#1F1720" />
      <path d="M40 69c4 5 12 5 16 0" fill="none" stroke="#2B1710" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 69v5h4v-5M48 69v5h4v-5" fill="#F8FAFC" />
      <path d="M27 35c4-16 38-20 45 0-13-5-32-5-45 0Z" fill="#111827" />
      <path d="M34 28c8-7 22-8 30 0l-4 10H38l-4-10Z" fill="#7C3AED" />
      <text x="49" y="35" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="900" fill="white">T</text>
      <path d="M28 61 13 57M28 66 12 67M68 61l15-4M68 66l16 1" stroke="#F3D5C0" strokeWidth="1.7" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}
