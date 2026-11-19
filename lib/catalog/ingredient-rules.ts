import { z } from "zod";
export const baumannTypeSchema = z.string().regex(/^[OD][SR][PN][WT]$/);
export const ingredientRuleSchema = z.object({
  standardName: z.string().min(1).max(100),
  inciName: z.string().max(100).nullable(),
  aliases: z.array(z.string().min(1).max(100)).max(30),
  targetAxis: z.enum([
    "ALL",
    "OILY",
    "DRY",
    "SENSITIVE",
    "RESISTANT",
    "PIGMENTED",
    "NON_PIGMENTED",
    "WRINKLED",
    "TIGHT",
  ]),
  cautionLevel: z.enum(["INFO", "CAUTION", "WARNING"]),
  reasonKo: z.string().min(1).max(1000),
  descriptionKo: z.string().min(1).max(1000),
});
export type IngredientRule = z.infer<typeof ingredientRuleSchema>;
export const ingredientRegulatoryNotice =
  "본 설명은 원료적 특성에 한하며, 질병의 예방 및 치료를 위한 의약품이 아닙니다.";
export const ingredientCoverageNotice =
  "등록된 대표 성분 규칙으로 확인한 참고 정보입니다. 농도·배합·개인 알레르기를 평가한 결과가 아니며, 미검출이 자극 없음이나 안전을 보장하지 않습니다.";
const forbidden = /치료|완치|질환\s*개선|부작용\s*없|무자극|흉터\s*재생|안전\s*보장/i;
export function assertIngredientCopy(text: string) {
  if (forbidden.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    throw new Error("Unreviewed ingredient copy");
  return text;
}
export const defaultIngredientRules: IngredientRule[] = [
  {
    standardName: "변성알코올",
    inciName: "Alcohol Denat.",
    aliases: ["에탄올", "Ethanol", "Alcohol", "알코올"],
    targetAxis: "SENSITIVE",
    cautionLevel: "CAUTION",
    reasonKo:
      "휘발성 알코올이 포함되어 있습니다. 민감하게 느껴지는 피부에서는 건조감이나 따가움이 생길 수 있어 사용 반응을 확인해 주세요.",
    descriptionKo: "용매로 사용되며 가벼운 사용감을 만드는 데 쓰입니다.",
  },
  {
    standardName: "향료",
    inciName: "Fragrance",
    aliases: ["Parfum", "Perfume", "합성향료"],
    targetAxis: "SENSITIVE",
    cautionLevel: "CAUTION",
    reasonKo:
      "향료가 포함되어 있습니다. 향 성분에 민감하거나 알레르기 경험이 있다면 상세 표기와 사용 반응을 확인해 주세요.",
    descriptionKo: "제품에 향을 부여하는 데 사용됩니다.",
  },
  {
    standardName: "소듐라우릴설페이트",
    inciName: "Sodium Lauryl Sulfate",
    aliases: ["SLS"],
    targetAxis: "DRY",
    cautionLevel: "CAUTION",
    reasonKo:
      "세정 성분이 포함되어 있습니다. 건조하게 느껴지는 피부에서는 세정 후 당김이 생길 수 있습니다. 제품 용도와 사용 시간을 확인해 주세요.",
    descriptionKo: "기름 성분과 물이 섞이도록 돕고 세정에 사용됩니다.",
  },
  {
    standardName: "소듐라우레스설페이트",
    inciName: "Sodium Laureth Sulfate",
    aliases: ["SLES"],
    targetAxis: "DRY",
    cautionLevel: "CAUTION",
    reasonKo:
      "세정 성분이 포함되어 있습니다. 건조한 피부에서는 세정 후 느낌과 사용 빈도를 확인해 주세요.",
    descriptionKo: "세정과 거품 형성에 사용되는 계면활성제입니다.",
  },
  {
    standardName: "살리실릭애씨드",
    inciName: "Salicylic Acid",
    aliases: ["살리실산"],
    targetAxis: "SENSITIVE",
    cautionLevel: "CAUTION",
    reasonKo:
      "각질 정돈 성분이 포함되어 있습니다. 전성분만으로 함량·pH를 알 수 없으므로 민감한 피부에서는 사용 빈도와 다른 각질 관리 제품의 병용을 확인해 주세요.",
    descriptionKo: "피부 표면의 각질을 정돈하는 용도로 사용됩니다.",
  },
  {
    standardName: "글라이콜릭애씨드",
    inciName: "Glycolic Acid",
    aliases: ["글리콜릭애씨드", "글리콜산"],
    targetAxis: "SENSITIVE",
    cautionLevel: "CAUTION",
    reasonKo:
      "각질 정돈 성분이 포함되어 있습니다. 전성분만으로 농도를 판단할 수 없습니다. 민감한 피부에서는 사용 반응과 제품 사용법을 확인해 주세요.",
    descriptionKo: "피부 표면의 각질을 정돈하는 용도로 사용됩니다.",
  },
  {
    standardName: "페퍼민트오일",
    inciName: "Mentha Piperita Oil",
    aliases: ["Peppermint Oil"],
    targetAxis: "SENSITIVE",
    cautionLevel: "CAUTION",
    reasonKo:
      "향을 부여하는 오일이 포함되어 있습니다. 향 성분에 민감한 피부에서는 사용 반응을 확인해 주세요.",
    descriptionKo: "제품의 향과 사용감을 위해 사용됩니다.",
  },
];
export const beneficialIngredientDefinitions = [
  {
    nameKo: "세라마이드",
    aliases: [],
    functionSummary:
      "피부 표면의 지질을 보완하는 데 쓰이는 성분군입니다. 구체적인 종류는 공식 전성분을 확인해 주세요.",
  },
  {
    nameKo: "히알루론산",
    aliases: ["Hyaluronic Acid"],
    functionSummary: "피부 표면에서 수분을 유지하는 데 쓰이는 보습 성분입니다.",
  },
  {
    nameKo: "판테놀",
    aliases: ["Panthenol"],
    functionSummary: "피부의 수분 유지와 부드러운 사용감을 돕는 보습 성분입니다.",
  },
  {
    nameKo: "세라마이드엔피",
    aliases: ["Ceramide NP"],
    functionSummary: "피부 표면의 지질 성분을 보완하고 수분 유지를 돕는 성분입니다.",
  },
  {
    nameKo: "글리세린",
    aliases: ["Glycerin", "Glycerol"],
    functionSummary: "수분을 끌어당겨 피부가 촉촉하게 유지되도록 돕습니다.",
  },
  {
    nameKo: "소듐하이알루로네이트",
    aliases: ["Sodium Hyaluronate"],
    functionSummary: "피부 표면에서 수분을 유지하는 데 쓰이는 보습 성분입니다.",
  },
  {
    nameKo: "나이아신아마이드",
    aliases: ["Niacinamide"],
    functionSummary:
      "피부 컨디셔닝에 사용됩니다. 제품의 기능성 여부와 사용법은 공식 표시를 확인해 주세요.",
  },
  {
    nameKo: "병풀추출물",
    aliases: ["Centella Asiatica Extract"],
    functionSummary: "피부 컨디셔닝을 위해 사용되는 식물 유래 성분입니다.",
  },
];
export function normalizeIngredient(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.\-_]/g, "");
}
export function parseFullIngredients(raw: string): string[] {
  // Keep numerical locants such as 1,2-Hexanediol together, and label order intact.
  return raw
    .normalize("NFKC")
    .split(/(?<!\d),|,(?!\d+(?:,\d+)*-)|[;\n\r、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function names(label: string): string[] {
  return [label, ...label.split(/[()（）]/)].map(normalizeIngredient).filter(Boolean);
}
export function ingredientMatches(label: string, aliases: readonly string[]): boolean {
  const normalized = aliases.map(normalizeIngredient);
  return names(label).some((name) => normalized.includes(name));
}
function applicable(axis: IngredientRule["targetAxis"], type: string | null) {
  if (axis === "ALL") return true;
  if (!type) return false;
  return [
    type[0] === "O" ? "OILY" : "DRY",
    type[1] === "S" ? "SENSITIVE" : "RESISTANT",
    type[2] === "P" ? "PIGMENTED" : "NON_PIGMENTED",
    type[3] === "W" ? "WRINKLED" : "TIGHT",
  ].includes(axis);
}
export function analyzeIngredients(
  full: string[],
  type: string | null,
  rules: IngredientRule[],
  recommended: string[] = [],
) {
  const cautionIngredients = rules
    .filter(
      (rule) =>
        applicable(rule.targetAxis, type) &&
        full.some((label) =>
          ingredientMatches(label, [rule.standardName, rule.inciName ?? "", ...rule.aliases]),
        ),
    )
    .map((rule) => ({
      nameKo: rule.standardName,
      level: rule.cautionLevel,
      matchedAxis: rule.targetAxis,
      badgeText: rule.targetAxis === "SENSITIVE" ? "민감성 피부 주의" : "성분 사용 주의",
      reasonKo: assertIngredientCopy(rule.reasonKo),
    }));
  const beneficialIngredients = beneficialIngredientDefinitions
    .filter((def) => full.some((label) => ingredientMatches(label, [def.nameKo, ...def.aliases])))
    .map((def) => ({
      nameKo: def.nameKo,
      functionSummary: assertIngredientCopy(def.functionSummary),
      isTargetMatched: recommended.some((label) =>
        ingredientMatches(label, [def.nameKo, ...def.aliases]),
      ),
    }));
  return { cautionIngredients, beneficialIngredients };
}
export function validateIngredientDefinitions(rules: IngredientRule[] = defaultIngredientRules) {
  for (const value of rules) {
    const rule = ingredientRuleSchema.parse(value);
    for (const text of [
      rule.standardName,
      rule.inciName ?? "",
      ...rule.aliases,
      rule.reasonKo,
      rule.descriptionKo,
    ])
      assertIngredientCopy(text);
  }
  for (const value of beneficialIngredientDefinitions)
    for (const text of [value.nameKo, ...value.aliases, value.functionSummary])
      assertIngredientCopy(text);
}
