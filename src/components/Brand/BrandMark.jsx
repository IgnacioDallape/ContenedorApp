export default function BrandMark({ size = 58, title = 'ImportaPro' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-label={title} role="img">
      <defs>
        <linearGradient id="brand-hull" x1="13" y1="47" x2="55" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6B5C" />
          <stop offset="1" stopColor="#D94841" />
        </linearGradient>
        <linearGradient id="brand-water" x1="13" y1="55" x2="59" y2="61" gradientUnits="userSpaceOnUse">
          <stop stopColor="#66A8FF" />
          <stop offset="1" stopColor="#2D6ED1" />
        </linearGradient>
        <linearGradient id="brand-body" x1="18" y1="24" x2="49" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFDF9" />
          <stop offset="1" stopColor="#F3EBDD" />
        </linearGradient>
      </defs>

      <path d="M19 48H57L52 58H23L19 48Z" fill="url(#brand-hull)" />
      <path d="M13 58H59C56.6 63.1 51.5 66 45.9 66H26.1C20.5 66 15.4 63.1 13 58Z" fill="url(#brand-water)" />
      <path d="M22 37H51V48H22V37Z" fill="url(#brand-body)" />
      <path d="M25 29H47V37H25V29Z" fill="url(#brand-body)" />
      <path d="M30 21H42V29H30V21Z" fill="url(#brand-body)" />
      <path d="M42 15L52 21H42V15Z" fill="#B49782" />
      <path d="M43 15V37" stroke="#5E4A3C" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M31 21L42 15" stroke="#5E4A3C" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M22 40.5H29" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M33 40.5H40" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M44 40.5H49" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M26 32.5H31" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M34 32.5H39" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M42 32.5H47" stroke="#26C6F7" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M21 51H54" stroke="#604B3D" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 61C19.5 59.4 21.4 59.3 24 61" stroke="#97C7FF" strokeWidth="2" strokeLinecap="round" />
      <path d="M27 63C29.4 61.5 31.5 61.3 34 63" stroke="#97C7FF" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 61C40.6 59.4 42.4 59.2 45 61" stroke="#97C7FF" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 63C50.5 61.5 52.7 61.2 55 63" stroke="#97C7FF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="56.5" cy="18.5" r="2.5" fill="#E8DACA" />
      <circle cx="17" cy="23" r="1.8" fill="#E8DACA" />
    </svg>
  );
}
