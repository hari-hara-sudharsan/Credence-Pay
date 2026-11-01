// Animated system map: packets travel along each leg of a purchase.
const PATHS = {
  order: "M150 118 C 210 52, 310 52, 370 118",
  pay: "M370 168 C 310 232, 210 232, 150 168",
  anchor: "M260 196 L 260 270",
};

function Packet({ path, color, dur, begin = "0s" }: { path: string; color: string; dur: string; begin?: string }) {
  return (
    <g>
      <circle r="9" fill={color} opacity="0.18">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.2 1" />
      </circle>
      <circle r="3.2" fill={color}>
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.2 1" />
      </circle>
    </g>
  );
}

export default function HeroDiagram() {
  return (
    <div className="glass halo tilt overflow-hidden p-2" data-tilt="4" style={{ borderRadius: 28 }}>
      <svg viewBox="0 0 520 380" className="w-full" role="img" aria-label="A payment agent and a receiving agent settling through HSP, with Credence recording trust on HSK Chain">
        <defs>
          <linearGradient id="hd-hsp" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#7c8cff" />
            <stop offset="0.6" stopColor="#8a6bff" />
            <stop offset="1" stopColor="#4fc8ff" />
          </linearGradient>
          <linearGradient id="hd-card" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--hd-card-a)" }} />
            <stop offset="1" style={{ stopColor: "var(--hd-card-b)" }} />
          </linearGradient>
          <radialGradient id="hd-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#8b9dff" stopOpacity="0.38" />
            <stop offset="1" stopColor="#8b9dff" stopOpacity="0" />
          </radialGradient>
          <filter id="hd-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <circle cx="260" cy="150" r="140" fill="url(#hd-glow)">
          <animate attributeName="r" values="125;150;125" dur="6s" repeatCount="indefinite" />
        </circle>

        {/* rails */}
        <path d={PATHS.order} fill="none" style={{ stroke: "var(--tier-net)" }} strokeOpacity="0.35" strokeWidth="1.4" className="flow-line" />
        <path d={PATHS.pay} fill="none" stroke="#8b9dff" strokeOpacity="0.45" strokeWidth="1.4" className="flow-line" />
        <path d={PATHS.anchor} fill="none" stroke="#c08cff" strokeOpacity="0.5" strokeWidth="1.4" className="flow-line" />

        <Packet path={PATHS.order} color="#5ee7ff" dur="3.2s" />
        <Packet path={PATHS.pay} color="#9aa8ff" dur="3.2s" begin="1.6s" />
        <Packet path={PATHS.anchor} color="#c08cff" dur="1.6s" begin="2.4s" />

        <text x="260" y="44" textAnchor="middle" style={{ fill: "var(--hd-dim)" }} fontSize="10.5" letterSpacing="0.4">order · terms · cart mandate</text>
        <text x="260" y="244" textAnchor="middle" style={{ fill: "var(--hd-dim)" }} fontSize="10.5" letterSpacing="0.4">signed payment mandate</text>

        {/* payment agent */}
        <g transform="translate(20 104)">
          <rect width="150" height="78" rx="18" fill="url(#hd-card)" style={{ stroke: "var(--hd-stroke)" }} />
          <circle cx="32" cy="39" r="17" style={{ fill: "var(--tier-credit)" }} opacity="0.16" />
          <circle cx="32" cy="39" r="17" fill="none" style={{ stroke: "var(--tier-credit)" }} strokeOpacity="0.5" />
          <text x="32" y="44" textAnchor="middle" style={{ fill: "var(--tier-credit)" }} fontSize="13" fontWeight="700">AL</text>
          <text x="58" y="35" style={{ fill: "var(--hd-ink)" }} fontSize="12" fontWeight="600">Lending Agent</text>
          <text x="58" y="52" style={{ fill: "var(--hd-dim)" }} fontSize="10">payment agent</text>
        </g>

        {/* receiving agent */}
        <g transform="translate(350 104)">
          <rect width="150" height="78" rx="18" fill="url(#hd-card)" style={{ stroke: "var(--hd-stroke)" }} />
          <circle cx="32" cy="39" r="17" style={{ fill: "var(--tier-net)" }} opacity="0.14" />
          <circle cx="32" cy="39" r="17" fill="none" style={{ stroke: "var(--tier-net)" }} strokeOpacity="0.5" />
          <text x="32" y="44" textAnchor="middle" style={{ fill: "var(--tier-net)" }} fontSize="13" fontWeight="700">CR</text>
          <text x="58" y="35" style={{ fill: "var(--hd-ink)" }} fontSize="12" fontWeight="600">Risk Agent</text>
          <text x="58" y="52" style={{ fill: "var(--hd-dim)" }} fontSize="10">receiving agent</text>
        </g>

        {/* HSP */}
        <g transform="translate(205 121)">
          <rect width="110" height="50" rx="14" fill="url(#hd-hsp)" filter="url(#hd-blur)" opacity="0.7" />
          <rect width="110" height="50" rx="14" fill="url(#hd-hsp)" />
          <rect x="1" y="1" width="108" height="24" rx="13" fill="#fff" opacity="0.12" />
          <text x="55" y="30" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="700" letterSpacing="1">HSP</text>
        </g>

        {/* chain */}
        <g transform="translate(100 270)">
          <rect width="320" height="88" rx="18" fill="url(#hd-card)" stroke="rgb(192 140 255 / 0.4)" />
          <text x="22" y="29" style={{ fill: "var(--color-violet)" }} fontSize="9.5" fontWeight="600" letterSpacing="1.8">HSK CHAIN · CREDENCE</text>
          <text x="22" y="53" style={{ fill: "var(--hd-ink)" }} fontSize="12.5">settlement anchored</text>
          <text x="22" y="71" style={{ fill: "var(--hd-dim)" }} fontSize="11">
            trust 745 → <tspan style={{ fill: "var(--tier-credit)" }} fontWeight="600">760</tspan>
          </text>
          <g transform="translate(186 40)">
            <rect width="114" height="28" rx="14" fill="rgb(242 205 133 / 0.12)" stroke="rgb(242 205 133 / 0.55)" />
            <text x="57" y="18" textAnchor="middle" style={{ fill: "var(--tier-credit)" }} fontSize="11" fontWeight="600">next: Credit tab</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
