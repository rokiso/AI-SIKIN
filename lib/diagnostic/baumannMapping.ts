import type { BaumannType } from "@/lib/dashboard/types";

export function describeBaumannType(type: BaumannType): string {
  return [
    type[0] === "O" ? "지성" : "건성",
    type[1] === "S" ? "민감" : "저항성",
    type[2] === "P" ? "색소침착 고민" : "색소침착 고민 적음",
    type[3] === "W" ? "주름" : "탄력",
    "피부",
  ].join(" ");
}

// General cosmetic guidance, never a prescription or a promise of treatment.
export function ingredientsForType(type: BaumannType) {
  const recommended = new Set<string>(["세라마이드"]);
  const caution = new Set<string>();
  recommended.add(type[0] === "D" ? "글리세린" : "나이아신아마이드");
  if (type[1] === "S") {
    recommended.add("판테놀");
    caution.add("향료");
    caution.add("변성알코올");
  } else recommended.add("히알루론산");
  if (type[2] === "P") recommended.add("나이아신아마이드");
  if (type[3] === "W") recommended.add("아데노신");
  if (type[0] === "D") caution.add("강한 세정 성분");
  return { recommendedIngredients: [...recommended], cautionIngredients: [...caution] };
}

export const ingredientNotes: Record<string, string> = {
  세라마이드: "피부 표면의 수분 손실을 줄이는 보습 관리에 참고할 수 있어요.",
  글리세린: "수분을 끌어당기는 보습 성분으로 건조한 느낌을 관리할 때 살펴보세요.",
  나이아신아마이드:
    "제품에 따라 보습과 피부 톤 관리에 쓰입니다. 민감하다면 낮은 농도부터 확인해 보세요.",
  판테놀: "보습과 피부 컨디셔닝에 쓰이는 성분입니다. 제형과 사용감을 함께 확인해 보세요.",
  히알루론산: "수분을 유지하는 보습 성분입니다. 건조한 환경에서는 보습제를 함께 살펴보세요.",
  아데노신:
    "일상적인 주름 고민을 관리하는 화장품에 쓰입니다. 제품의 표시와 사용법을 확인해 주세요.",
  향료: "향 성분에 자극을 경험했다면 무향 제품을 우선 살펴보세요.",
  변성알코올:
    "농도와 제형에 따라 건조함이나 따가움을 느낄 수 있어요. 본인의 사용 경험을 확인해 주세요.",
  "강한 세정 성분": "과도한 세정 후 당김을 경험했다면 순한 세정 방식부터 살펴보세요.",
};
