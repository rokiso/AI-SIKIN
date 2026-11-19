import type { PrismaClient } from "../../generated/prisma/client";
import { procedureGuides, rfMicroneedlingRiskNote } from "./procedures";
import {
  procedureSafetyRoutes,
  safetyContentSchema,
  type ProcedureSafetyContent,
} from "../../lib/catalog/procedure-safety-types";
export const safetyDisclaimer =
  "이 안내는 기존 일반 시술 자료를 정리한 상담 준비용 정보입니다. 개인의 적응증·금기를 판정하거나 의료진의 진료를 대신하지 않습니다. 위험의 발생 빈도와 회복 기간은 장비·제품·시술 방법에 따라 다릅니다. 시술 여부와 사후 관리는 의료진과 확인해 주세요.";
const standardCare = [
  "세안·화장·보습·자외선 차단을 시작하는 시점은 피부 상태와 시술 방법에 맞춰 안내받으세요.",
  "강한 마찰·스크럽이나 추가 각질 관리 제품의 사용 여부와 재사용 시점을 의료진에게 확인하세요.",
  "붉은 기·붓기·통증이 심해지거나 예상한 회복과 다르면 시술 기관에 연락하고 진료 여부를 확인하세요.",
];
const priorReview = [
  "시술 부위의 염증·상처와 최근 시술 이력을 미리 알려 주세요.",
  "임신·수유 여부, 알레르기와 복용·도포 중인 약을 알리고 사용 장비·제품의 주의사항을 확인하세요.",
  "이 항목은 모든 사람에게 적용되는 절대 금기 목록이 아닙니다. 진행 가능 여부는 의료진의 사전 확인이 필요합니다.",
];
const details: Record<
  string,
  { common: string[]; risks: string[]; review?: string[]; care?: string[] }
> = {
  "P-PICO": {
    common: [
      "붉은 기가 남을 수 있습니다.",
      "건조감이 생길 수 있습니다.",
      "일시적인 피부 자극감이 생길 수 있습니다.",
    ],
    risks: ["색소침착 또는 저색소침착이 생기거나 기존 색소가 오히려 진해질 수 있습니다."],
  },
  "P-FRACTIONAL": {
    common: [
      "붉은 기가 남을 수 있습니다.",
      "붓기가 생길 수 있습니다.",
      "각질이나 딱지가 생길 수 있습니다.",
    ],
    risks: [
      "감염·색소침착·흉터가 발생할 수 있습니다. 장비 종류와 강도에 따라 위험과 회복 과정이 다릅니다.",
    ],
    care: [
      "딱지나 각질을 임의로 떼거나 문지르지 말고 세안·보습·화장 시점을 안내받으세요.",
      ...standardCare.slice(1),
    ],
  },
  "P-LDM": {
    common: ["일시적인 열감이 생길 수 있습니다.", "피부 자극이 생길 수 있습니다."],
    risks: [
      "기존 자료만으로 장비별 위험의 종류나 빈도를 일률적으로 정할 수 없습니다. 사용할 장비의 주의사항을 확인하세요.",
    ],
    review: [
      "피부 염증, 이식 기기와 건강 상태를 시술 전에 알리고 장비별 금기사항을 확인하세요.",
      ...priorReview.slice(1),
    ],
  },
  "P-AQUAPEEL": {
    common: [
      "건조감이 생길 수 있습니다.",
      "따가움이나 붉은 기가 생길 수 있습니다.",
      "용액에 의한 접촉성 자극이 생길 수 있습니다.",
    ],
    risks: ["피부 장벽이 약하거나 염증이 있는 부위는 자극이 커질 수 있어 사전 확인이 필요합니다."],
  },
  "P-HIFU": {
    common: [
      "시술 중·후 통증이나 압통이 생길 수 있습니다.",
      "붓기·멍이 생길 수 있습니다.",
      "감각 변화가 남을 수 있습니다.",
    ],
    risks: [
      "화상·지속적인 감각 변화·지방 위축이 생길 수 있습니다. 깊이·부위·에너지 설정을 확인하세요.",
    ],
    care: [
      "심한 통증·비대칭·지속적인 감각 이상은 의료진에게 알려 주세요.",
      ...standardCare.slice(0, 2),
    ],
  },
  "P-RF": {
    common: ["열감이 생길 수 있습니다.", "붉은 기가 남을 수 있습니다.", "부종이 생길 수 있습니다."],
    risks: [
      "화상이나 지방 위축이 발생할 수 있습니다. 바늘 사용 여부와 열 전달 방식에 따라 위험이 다릅니다.",
      rfMicroneedlingRiskNote,
    ],
    review: [
      "이식형 전자기기·금속 삽입 여부를 알리고 해당 장비로 진행 가능한지 확인하세요.",
      ...priorReview.slice(1),
    ],
    care: [
      "수포·심한 통증·지속적인 붓기가 있으면 시술 기관에 연락하고 진료받으세요.",
      ...standardCare.slice(0, 2),
    ],
  },
  "P-PN": {
    common: [
      "주입 부위의 통증·붓기가 생길 수 있습니다.",
      "멍이 생길 수 있습니다.",
      "주입 부위가 일시적으로 울퉁불퉁해질 수 있습니다.",
    ],
    risks: ["감염 또는 알레르기 반응이 생길 수 있습니다. 원료 알레르기와 복용 약물을 알려 주세요."],
    care: [
      "심한 통증·피부색 변화·열감이 있으면 바로 의료진에게 문의하세요.",
      ...standardCare.slice(0, 2),
    ],
  },
  "P-HA": {
    common: [
      "멍이 생길 수 있습니다.",
      "붓기가 생길 수 있습니다.",
      "결절이나 울퉁불퉁함이 남을 수 있습니다.",
    ],
    risks: ["감염·알레르기 반응 또는 혈관 관련 합병증이 생길 수 있습니다."],
    care: [
      "갑작스러운 시야 변화·심한 통증·피부색 변화는 기다리지 말고 즉시 진료받으세요.",
      ...standardCare.slice(0, 2),
    ],
  },
  "P-PEEL": {
    common: [
      "따가움이 생길 수 있습니다.",
      "건조감이 생길 수 있습니다.",
      "각질 탈락이 나타날 수 있습니다.",
    ],
    risks: ["피부염 또는 색소침착이 발생할 수 있습니다. 성분·농도·깊이에 따라 반응이 다릅니다."],
    review: [
      "레티노이드·각질 제거 제품 사용과 최근 시술 이력을 알리고 병행 가능 여부를 확인하세요.",
      ...priorReview.slice(1),
    ],
    care: ["피부를 문지르거나 각질을 억지로 떼지 마세요.", ...standardCare.slice(0, 2)],
  },
  "P-PDL": {
    common: [
      "붉은 기·붓기가 생길 수 있습니다.",
      "자반이나 멍이 남을 수 있습니다.",
      "조사 조건에 따라 회복 과정이 달라집니다.",
    ],
    risks: ["물집 또는 색소 변화가 생길 수 있습니다. 이상 반응이 있으면 시술 기관에 문의하세요."],
  },
};
export const procedureSafetySeeds = procedureSafetyRoutes.map((route) => {
  const guide = procedureGuides.find((g) => g.code === route.code);
  const detail = details[route.code];
  if (!guide || !detail) throw Error("Safety guide source missing");
  const content: ProcedureSafetyContent = {
    commonSideEffects: detail.common,
    rareRisks: detail.risks,
    contraindications: detail.review ?? priorReview,
    postCareInstructions: detail.care ?? standardCare,
    defenseQuestions: [
      {
        id: "Q-DEF-01",
        category: "적합성·단독 시술과 대안",
        question:
          guide.checklistQuestions[0] +
          " 다른 시술을 함께 받지 않는 선택지와 단계적으로 결정하는 방법도 설명해 주세요.",
        reason:
          "내 고민에 필요한 범위와 다른 선택지를 먼저 확인하고 패키지를 서둘러 결정하지 않기 위해서입니다.",
      },
      {
        id: "Q-DEF-02",
        category: "부작용·사후 조치",
        question:
          guide.checklistQuestions[1] +
          " 이상 반응 시 연락·진료 절차와 추가 비용 기준을 서면으로 확인할 수 있나요?",
        reason:
          "가능한 위험과 문제 발생 시 연락 방법, 사후 관리의 범위와 비용을 미리 확인하기 위해서입니다.",
      },
      {
        id: "Q-DEF-03",
        category: "정품·수량·총비용",
        question:
          guide.checklistQuestions[2] +
          " 사용하는 장비·팁·제품과 해당하는 샷 수·용량·관리 시간을 확인할 수 있나요?",
        reason:
          "단위가 다른 가격을 같은 조건으로 오해하지 않고 실제 제공되는 내용과 추가 비용을 확인하기 위해서입니다.",
      },
    ],
    disclaimerText: safetyDisclaimer,
  };
  return { ...route, ...safetyContentSchema.parse(content) };
});
export async function seedProcedureSafetyGuides(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const procedures = await tx.medicalProcedure.findMany({
      where: { code: { in: procedureSafetyRoutes.map((r) => r.code) } },
      select: { id: true, code: true },
    });
    if (procedures.length !== 10) throw Error("Seed the ten procedure guides first");
    for (const guide of procedureSafetySeeds) {
      const procedure = procedures.find((p) => p.code === guide.code);
      if (!procedure) throw Error("Procedure unavailable");
      const { code, category, ...content } = guide;
      void code;
      void category;
      await tx.procedureSafetyGuide.upsert({
        where: { procedureId: procedure.id },
        update: {},
        create: { ...content, procedureId: procedure.id },
      });
    }
    return { guides: procedureSafetySeeds.length };
  });
}
