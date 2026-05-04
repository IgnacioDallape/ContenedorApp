export default function BrandMark({ size = 58, title = 'ImportaPro' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-label={title} role="img">
      <defs>
        <linearGradient id="brand-hull" x1="17" y1="45" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6F5E" />
          <stop offset="1" stopColor="#D64A43" />
        </linearGradient>
        <linearGradient id="brand-water" x1="15" y1="55" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#70B6FF" />
          <stop offset="1" stopColor="#3B7BE0" />
        </linearGradient>
        <linearGradient id="brand-body" x1="20" y1="22" x2="46" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFDF9" />
          <stop offset="1" stopColor="#F7F0E7" />
        </linearGradient>
      </defs>

      <path d="M19 46H53L49.5 54H22.5L19 46Z" fill="url(#brand-hull)" />
      <path d="M15 54.5H57C55 58.3 50.6 60.5 45.8 60.5H26.2C21.4 60.5 17 58.3 15 54.5Z" fill="url(#brand-water)" />
      <path d="M20 38H48V46H20V38Z" fill="url(#brand-body)" />
      <path d="M23 30H45V38H23V30Z" fill="url(#brand-body)" />
      <path d="M29 22H41V30H29V22Z" fill="url(#brand-body)" />
      <path d="M40 16L49.5 22H40V16Z" fill="#A88C77" />
      <path d="M40 16V38" stroke="#615040" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M30 22L40 16" stroke="#615040" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M21.5 41.5H28" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M31 41.5H37.5" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40.5 41.5H46.5" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24.5 33.6H29.5" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M32.2 33.6H37.2" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M39.8 33.6H44.2" stroke="#27C7F7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 49H50.5" stroke="#6A5645" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M19 57.5C21 56.1 22.8 56.1 25 57.5" stroke="#93C6FF" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M28 59C30.1 57.7 32 57.6 34.1 59" stroke="#93C6FF" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M37 57.5C39.1 56.1 41 56 43.1 57.5" stroke="#93C6FF" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M46 59C48 57.7 49.8 57.5 51.6 59" stroke="#93C6FF" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="53.5" cy="18.5" r="2.1" fill="#E2D4C5" />
      <circle cx="20.2" cy="21.7" r="1.6" fill="#E2D4C5" />
    </svg>
  );
}
