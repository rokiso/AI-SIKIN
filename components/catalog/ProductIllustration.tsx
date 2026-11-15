import type { ProductRecommendationResponse } from "@/lib/catalog/types";
export function ProductIllustration({
  category,
}: {
  category: ProductRecommendationResponse["categories"][number]["category"];
}) {
  const tube = category === "SUNSCREEN";
  const jar = category === "CREAM";
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" className="h-full w-full text-primary-700">
      <ellipse cx="80" cy="140" rx="42" ry="6" className="fill-neutral-200" />
      {jar ? (
        <>
          <rect
            x="39"
            y="73"
            width="82"
            height="60"
            rx="14"
            className="fill-primary-100 stroke-primary-700"
            strokeWidth="1.5"
          />
          <rect
            x="36"
            y="62"
            width="88"
            height="20"
            rx="6"
            className="fill-surface stroke-primary-700"
            strokeWidth="1.5"
          />
        </>
      ) : tube ? (
        <>
          <path
            d="M46 31h68l-8 93H54z"
            className="fill-primary-100 stroke-primary-700"
            strokeWidth="1.5"
          />
          <rect x="55" y="123" width="50" height="14" rx="3" className="fill-primary-700" />
        </>
      ) : (
        <>
          <rect
            x="64"
            y="24"
            width="32"
            height={category === "AMPOULE" ? "31" : "21"}
            rx="5"
            className="fill-primary-700"
          />
          <rect
            x="49"
            y="45"
            width="62"
            height="90"
            rx={category === "AMPOULE" ? "18" : "10"}
            className="fill-primary-100 stroke-primary-700"
            strokeWidth="1.5"
          />
        </>
      )}
      <rect
        x={jar ? "50" : "58"}
        y={jar ? "91" : "76"}
        width={jar ? "60" : "44"}
        height="29"
        rx="3"
        className="fill-surface"
      />
      <text
        x="80"
        y={jar ? "108" : "93"}
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="currentColor"
      >
        SIKIN
      </text>
    </svg>
  );
}
