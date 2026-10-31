export default function HeroDiagram() {
  return (
    <div className="glass relative overflow-hidden p-2">
      <svg viewBox="0 0 520 380" className="w-full" role="img" aria-label="A payment agent and a receiving agent settling through HSP, with Credence recording trust on HSK Chain">
        <defs>
          <linearGradient id="g-accent" x1="0" x2="1">
            <stop offset="0" stopColor="#30d158" />
            <stop offset="1" stopColor="#2997ff" />
          </linearGradient>
          <radialGradient id="g-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#30d158" stopOpacity="0.35" />
            <stop offset="1" stopColor="#30d158" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="260" cy="150" r="120" fill="url(#g-glow)" />

        {/* flows */}
        <path d="M120 110 C 190 60, 330 60, 400 110" fill="none" stroke="#64d2ff" strokeWidth="1.6" className="flow-line" />
        <path d="M400 150 C 330 200, 190 200, 120 150" fill="none" stroke="url(#g-accent)" strokeWidth="1.6" className="flow-line" />
        <path d="M260 196 L 260 268" fill="none" stroke="#bf5af2" strokeWidth="1.6" className="flow-line" />

        <text x="260" y="52" textAnchor="middle" fill="#a1a1a6" fontSize="11">order · terms · cart mandate</text>
        <text x="260" y="222" textAnchor="middle" fill="#a1a1a6" fontSize="11">signed payment mandate</text>

        {/* payment agent */}
        <g transform="translate(40 92)">
          <rect width="150" height="78" rx="16" fill="#1c1c1e" stroke="rgb(255 255 255 / 0.12)" />
          <circle cx="30" cy="39" r="16" fill="#30d158" opacity="0.18" />
          <text x="30" y="44" textAnchor="middle" fill="#30d158" fontSize="14" fontWeight="700">AL</text>
          <text x="56" y="34" fill="#f5f5f7" fontSize="12" fontWeight="600">Lending Agent</text>
          <text x="56" y="52" fill="#a1a1a6" fontSize="10">payment agent</text>
        </g>

        {/* receiving agent */}
        <g transform="translate(330 92)">
          <rect width="150" height="78" rx="16" fill="#1c1c1e" stroke="rgb(255 255 255 / 0.12)" />
          <circle cx="30" cy="39" r="16" fill="#2997ff" opacity="0.18" />
          <text x="30" y="44" textAnchor="middle" fill="#2997ff" fontSize="14" fontWeight="700">CR</text>
          <text x="56" y="34" fill="#f5f5f7" fontSize="12" fontWeight="600">Risk Agent</text>
          <text x="56" y="52" fill="#a1a1a6" fontSize="10">receiving agent</text>
        </g>

        {/* HSP */}
        <g transform="translate(205 128)">
          <rect width="110" height="44" rx="12" fill="url(#g-accent)" />
          <text x="55" y="27" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">HSP</text>
        </g>

        {/* chain */}
        <g transform="translate(110 268)">
          <rect width="300" height="84" rx="16" fill="#1c1c1e" stroke="rgb(191 90 242 / 0.4)" />
          <text x="20" y="28" fill="#bf5af2" fontSize="10" fontWeight="600" letterSpacing="1.5">HSK CHAIN · CREDENCE</text>
          <text x="20" y="52" fill="#f5f5f7" fontSize="12">settlement anchored</text>
          <text x="20" y="70" fill="#a1a1a6" fontSize="11">trust 500 → 515</text>
          <g transform="translate(176 40)">
            <rect width="104" height="28" rx="14" fill="rgb(48 209 88 / 0.12)" stroke="rgb(48 209 88 / 0.5)" />
            <text x="52" y="18" textAnchor="middle" fill="#30d158" fontSize="11" fontWeight="600">next: Net 7</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
