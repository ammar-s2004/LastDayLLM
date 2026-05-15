export function HydraLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 0 6px rgba(124,58,237,0.5))" }}
    >
      <g stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Middle Neck */}
        <path d="M 30 52 L 30 22" />
        {/* Middle Head (Diamond) */}
        <path d="M 30 22 L 27 15 L 30 8 L 33 15 Z" />
        
        {/* Left Neck */}
        <path d="M 30 52 C 26 40 18 32 14 24" />
        {/* Left Head */}
        <path d="M 14 24 L 9 17 L 12 10 L 18 16 Z" />
        
        {/* Right Neck */}
        <path d="M 30 52 C 34 40 42 32 46 24" />
        {/* Right Head */}
        <path d="M 46 24 L 51 17 L 48 10 L 42 16 Z" />
      </g>
    </svg>
  );
}
