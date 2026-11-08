export function BanhMiMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <g transform="rotate(-24 40 40)">
        <path
          d="M7 36C7 22 19 15 33 15H49C64 15 73 23 73 36H7Z"
          fill="#F7BB38"
        />
        <path
          d="M28 19L24 28M44 19L40 28M60 21L56 29"
          stroke="#FFF8E9"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M9 42L20 39L30 43L41 39L52 43L63 39L71 42"
          stroke="#087F5B"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 48H68"
          stroke="#DC3C2E"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M10 54H70C66 63 59 66 48 66H31C20 66 14 62 10 54Z"
          fill="#F7BB38"
        />
      </g>
    </svg>
  );
}
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`beply-logo ${compact ? "compact" : ""}`}
      aria-label="beply"
    >
      <BanhMiMark size={compact ? 34 : 52} />
      <span className="beply-wordmark">
        beply<span className="brand-period">.</span>
      </span>
    </span>
  );
}
