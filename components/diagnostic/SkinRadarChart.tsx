import type { AxisScores } from "@/lib/dashboard/types";
const axes = [
  { key: "oiliness", label: "유분", low: "건조", high: "유분 고민", x: 0, y: -1 },
  { key: "sensitivity", label: "민감도", low: "민감 반응 적음", high: "민감 반응", x: 1, y: 0 },
  { key: "pigmentation", label: "색소", low: "색소 고민 적음", high: "색소 고민", x: 0, y: 1 },
  { key: "elasticity", label: "탄력·주름", low: "주름 고민 적음", high: "주름 고민", x: -1, y: 0 },
] as const;
export function SkinRadarChart({ scores }: { scores: AxisScores }) {
  const point = (x: number, y: number, scale: number) =>
    `${140 + x * 85 * scale},${125 + y * 85 * scale}`;
  return (
    <figure aria-label="피부 4개 축 참고 점수" className="min-w-0">
      <svg
        viewBox="0 0 280 255"
        role="img"
        aria-label="유분, 민감도, 색소, 탄력과 주름 레이더 차트"
        className="mx-auto w-full max-w-[320px] overflow-visible"
      >
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={axes.map((a) => point(a.x, a.y, scale)).join(" ")}
            className="fill-none stroke-neutral-200"
          />
        ))}
        {axes.map((a) => (
          <line
            key={a.key}
            x1="140"
            y1="125"
            x2={140 + a.x * 85}
            y2={125 + a.y * 85}
            className="stroke-neutral-200"
          />
        ))}
        <polygon
          points={axes.map((a) => point(a.x, a.y, scores[a.key] / 100)).join(" ")}
          className="fill-primary-100 stroke-primary-700"
          strokeWidth="2"
        />
        {axes.map((a) => (
          <circle
            key={a.key}
            cx={140 + (a.x * 85 * scores[a.key]) / 100}
            cy={125 + (a.y * 85 * scores[a.key]) / 100}
            r="3"
            className="fill-primary-700"
          />
        ))}
        <g className="fill-neutral-700 text-xs" textAnchor="middle">
          <text x="140" y="20">
            유분
          </text>
          <text x="251" y="129">
            민감도
          </text>
          <text x="140" y="237">
            색소
          </text>
          <text x="29" y="129">
            탄력·주름
          </text>
        </g>
      </svg>
      <figcaption className="space-y-3">
        <p className="text-xs leading-relaxed text-neutral-600">
          0~100의 참고 점수예요. 높을수록 해당 특성이나 고민이 크다는 뜻이며, 피부 건강의 우열을
          뜻하지 않습니다.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {axes.map((a) => (
            <div key={a.key} className="rounded-xl bg-surface-muted p-3">
              <dt className="text-neutral-600">{a.label}</dt>
              <dd className="mt-1 font-semibold text-neutral-900">
                {scores[a.key]} / 100
                <span className="mt-1 block text-xs font-normal text-neutral-600">
                  {scores[a.key] >= 50 ? a.high : a.low}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
