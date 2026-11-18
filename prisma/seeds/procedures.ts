import type { PrismaClient } from "../../generated/prisma/client";
import type { ProcedureConcern } from "../../lib/catalog/procedures";

type Guide = {
  code: string;
  nameKo: string;
  concernType: ProcedureConcern;
  aliases: string[];
  principleText: string;
  sideEffects: string[];
  recoveryPeriod: string;
  checklistQuestions: string[];
};
export const procedureGuides: Guide[] = [
  {
    code: "P-PICO",
    nameKo: "피코레이저 토닝",
    concernType: "PIGMENTATION",
    aliases: ["피코토닝"],
    principleText:
      "피코초 단위의 짧은 레이저 펄스를 이용해 색소 입자에 에너지를 전달합니다. 파장과 조사 방식에 따라 적용 범위가 달라지며, 모든 잡티나 홍조에 같은 방식으로 적용되는 것은 아닙니다.",
    sideEffects: [
      "붉은 기, 건조감, 색소침착 또는 저색소침착이 생길 수 있습니다. 색소가 오히려 진해지는 경우도 있어 피부 상태에 맞는 판단이 필요합니다.",
    ],
    recoveryPeriod:
      "일시적인 붉은 기나 자극이 남을 수 있습니다. 세안·화장·자외선 차단 시점은 시술 방식에 따라 확인해 주세요.",
    checklistQuestions: [
      "제 색소 고민에 이 파장과 시술 방식이 적합한 이유는 무엇인가요?",
      "색소가 진해지거나 피부색이 옅어질 가능성과 대응 방법은 무엇인가요?",
      "1회 비용에 포함되는 부위·조사 횟수·진정 관리·부가세는 어떻게 되나요?",
    ],
  },
  {
    code: "P-FRACTIONAL",
    nameKo: "프락셔널 레이저",
    concernType: "ACNE_SCAR",
    aliases: ["프랙셔널 레이저"],
    principleText:
      "피부의 일부에 미세한 구역을 나누어 레이저 에너지를 전달하는 방식입니다. 박피성·비박피성 장비와 조사 깊이에 따라 피부 반응과 회복 과정이 다릅니다.",
    sideEffects: [
      "붉은 기, 붓기, 딱지, 감염, 색소침착 또는 흉터가 발생할 수 있습니다. 흉터의 종류와 피부색에 따라 적합성이 달라집니다.",
    ],
    recoveryPeriod:
      "박피 여부와 강도에 따라 차이가 큽니다. 딱지가 생기면 임의로 떼지 말고 세안·보습·화장 시점을 안내받으세요.",
    checklistQuestions: [
      "제 흉터 유형에 박피성 또는 비박피성 방식이 적합한가요?",
      "감염·색소침착의 위험과 회복 중 연락해야 할 증상은 무엇인가요?",
      "장비 종류·부위·마취·재생 관리가 포함된 1회 총비용은 얼마인가요?",
    ],
  },
  {
    code: "P-LDM",
    nameKo: "다중 주파수 초음파 관리",
    concernType: "BARRIER_REDNESS",
    aliases: ["LDM", "물방울 관리"],
    principleText:
      "서로 다른 주파수의 초음파를 피부에 전달하는 방식입니다. 고강도 집속초음파와 작동 조건이 다르며, 사용 장비와 목적을 구분해서 확인해야 합니다.",
    sideEffects: [
      "일시적인 열감이나 자극이 생길 수 있습니다. 피부 염증, 이식 기기 또는 금기사항이 있다면 시술 전에 알려 주세요.",
    ],
    recoveryPeriod:
      "피부 민감도와 함께 받는 관리에 따라 반응이 다릅니다. 자극이 지속되면 시술 기관에 문의하세요.",
    checklistQuestions: [
      "제 피부 상태에서 초음파 관리의 목적과 기대 가능한 변화는 무엇인가요?",
      "사용 장비와 제 건강 상태에서 확인해야 할 금기사항은 무엇인가요?",
      "부위·관리 시간·도포 제품·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-AQUAPEEL",
    nameKo: "아쿠아필",
    concernType: "PORE_SEBUM",
    aliases: ["수분 필링"],
    principleText:
      "용액과 흡입을 이용해 피부 표면의 각질과 피지를 정돈하는 관리입니다. 용액의 성분과 농도, 흡입 강도에 따라 자극 정도가 달라집니다.",
    sideEffects: [
      "건조감, 따가움, 붉은 기 또는 접촉성 자극이 생길 수 있습니다. 피부 장벽이 약하거나 염증이 있는 부위는 주의가 필요합니다.",
    ],
    recoveryPeriod:
      "따가움이나 건조감이 남을 수 있습니다. 다른 각질 제거 제품의 재사용 시점을 확인해 주세요.",
    checklistQuestions: [
      "제 피부에서 각질 제거가 필요한지, 자극 위험은 어느 정도인가요?",
      "사용 용액의 성분과 알레르기·자극 발생 시 대응은 무엇인가요?",
      "관리 부위·단계·진정 관리·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-HIFU",
    nameKo: "집속초음파 리프팅",
    concernType: "ELASTICITY",
    aliases: ["HIFU", "하이푸"],
    principleText:
      "초음파 에너지를 정해진 깊이에 집중시켜 열 반응을 일으키는 방식입니다. 조사 깊이와 부위, 에너지 설정에 따라 반응이 달라집니다.",
    sideEffects: [
      "통증, 붓기, 멍, 화상, 감각 변화 또는 지방 위축이 발생할 수 있습니다. 얼굴의 지방 분포와 시술 깊이를 고려해야 합니다.",
    ],
    recoveryPeriod:
      "압통이나 감각 변화가 남을 수 있습니다. 심한 통증·비대칭·지속적인 감각 이상은 의료진에게 알려 주세요.",
    checklistQuestions: [
      "제 얼굴의 지방 분포와 피부 두께에 이 시술이 적합한가요?",
      "사용 장비·정품 팁·조사 깊이와 화상·감각 이상 대응은 어떻게 확인하나요?",
      "부위·샷 수·카트리지·부가세가 포함된 1회 총비용은 얼마인가요?",
    ],
  },
  {
    code: "P-RF",
    nameKo: "고주파 타이트닝",
    concernType: "ELASTICITY",
    aliases: ["RF 타이트닝"],
    principleText:
      "고주파 전류에 의한 조직의 저항을 이용해 열을 전달하는 방식입니다. 단극성·양극성 등 장비 구조와 바늘 사용 여부에 따라 시술 과정이 다릅니다.",
    sideEffects: [
      "열감, 붉은 기, 부종, 화상 또는 지방 위축이 발생할 수 있습니다. 이식형 전자기기나 금속 삽입 여부를 사전에 알려 주세요.",
    ],
    recoveryPeriod:
      "바늘 사용 여부와 강도에 따라 회복이 다릅니다. 수포·심한 통증·지속적인 붓기는 진료가 필요할 수 있습니다.",
    checklistQuestions: [
      "제 피부 상태에서 사용할 고주파 방식과 바늘 사용 여부는 무엇인가요?",
      "정품 팁 확인과 온도 관리, 화상 발생 시 대응은 어떻게 하나요?",
      "장비·부위·샷 수·팁·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-PN",
    nameKo: "PN 스킨부스터 주입",
    concernType: "ELASTICITY",
    aliases: ["폴리뉴클레오티드 스킨부스터"],
    principleText:
      "폴리뉴클레오티드(PN) 성분이 포함된 제제를 피부에 주입하는 방식입니다. 제품별 허가 목적과 주입 깊이·용량을 확인해야 하며, 모든 스킨부스터가 같은 성분은 아닙니다.",
    sideEffects: [
      "주입 부위의 통증, 붓기, 멍, 울퉁불퉁함, 감염 또는 알레르기 반응이 생길 수 있습니다. 원료 알레르기와 복용 약물을 알려 주세요.",
    ],
    recoveryPeriod:
      "주입 부위의 작은 돌출이나 멍이 남을 수 있습니다. 심한 통증·색 변화·열감이 있으면 바로 의료진에게 문의하세요.",
    checklistQuestions: [
      "제 피부 고민에 PN 주입이 적합한 이유와 제품의 허가 목적은 무엇인가요?",
      "제품명·정품·개봉·주입 용량을 확인할 수 있고 부작용 시 어떻게 대응하나요?",
      "용량·부위·마취·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-HA",
    nameKo: "히알루론산 스킨부스터",
    concernType: "BARRIER_REDNESS",
    aliases: ["HA 스킨부스터", "수분 주입 관리"],
    principleText:
      "수분을 끌어당기는 성질이 있는 히알루론산 제제를 피부에 주입하는 방식입니다. 가교 여부·성분·제품 허가 목적에 따라 특성과 주의사항이 달라집니다.",
    sideEffects: [
      "멍, 부종, 결절, 감염 또는 알레르기 반응이 생길 수 있습니다. 드물게 혈관 관련 합병증이 생길 수 있어 시술 후 급격한 통증이나 피부색 변화는 즉시 확인해야 합니다.",
    ],
    recoveryPeriod:
      "붓기나 멍의 기간은 제제와 주입 방법에 따라 다릅니다. 갑작스러운 시야 변화·심한 통증·피부색 변화는 즉시 진료받으세요.",
    checklistQuestions: [
      "제 피부 상태에서 주입이 필요한지, 사용할 제제의 성분과 허가 목적은 무엇인가요?",
      "정품·주입 용량을 확인할 수 있고 혈관 관련 이상 시 응급 대응은 무엇인가요?",
      "제제·용량·부위·마취·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-PEEL",
    nameKo: "필링·산소 스케일링",
    concernType: "PORE_SEBUM",
    aliases: ["각질 정돈 관리"],
    principleText:
      "필링은 성분을 이용해 피부 표면 각질의 탈락을 유도하는 방식입니다. 산소 스케일링은 통칭으로, 사용 장비와 성분에 따라 실제 과정이 달라 같은 시술로 단정할 수 없습니다.",
    sideEffects: [
      "따가움, 건조감, 피부염 또는 색소침착이 생길 수 있습니다. 레티노이드·각질 제거 제품 사용과 최근 시술 이력을 알려 주세요.",
    ],
    recoveryPeriod:
      "성분·농도·깊이에 따라 각질 탈락과 회복 정도가 다릅니다. 피부를 문지르거나 각질을 억지로 떼지 마세요.",
    checklistQuestions: [
      "실제 사용하는 성분·농도·장비와 제 피부에 적합한 이유는 무엇인가요?",
      "복용·도포 중인 제품과 병행해도 되는지, 자극 시 어떻게 대응하나요?",
      "시술 종류·부위·진정 관리·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
  {
    code: "P-PDL",
    nameKo: "혈관·홍조 다이레이저",
    concernType: "BARRIER_REDNESS",
    aliases: ["펄스 다이레이저", "PDL"],
    principleText:
      "혈액 속 헤모글로빈에 흡수되는 파장의 빛을 이용해 혈관에 열 에너지를 전달하는 방식입니다. 홍조의 원인에 따라 적용 여부가 달라지므로 먼저 원인을 확인해야 합니다.",
    sideEffects: [
      "붉은 기, 붓기, 자반·멍, 물집 또는 색소 변화가 생길 수 있습니다. 조사 조건과 피부색에 따라 반응이 달라집니다.",
    ],
    recoveryPeriod:
      "자반이나 멍이 남을 수 있으며 조사 조건에 따라 차이가 있습니다. 중요한 일정 전에 예상 회복 과정을 확인하세요.",
    checklistQuestions: [
      "제 홍조의 원인에 혈관 레이저가 적합한지 먼저 확인할 수 있나요?",
      "사용 장비와 멍 발생 가능성, 물집·색소 변화 시 대응은 무엇인가요?",
      "부위·조사 범위·진정 관리·부가세가 포함된 1회 비용은 얼마인가요?",
    ],
  },
];

/** Local educational catalog only. No fabricated prices, no overwrite of curated records. */
export async function seedProcedureGuides(client: PrismaClient) {
  await client.$transaction(async (tx) => {
    for (const [index, guide] of procedureGuides.entries()) {
      await tx.medicalProcedure.upsert({
        where: { code: guide.code },
        update: {},
        create: {
          ...guide,
          sortOrder: index + 1,
          isActive: true,
          recommendedInterval:
            "피부 상태·장비·시술 강도에 따라 달라집니다. 다음 시술 전 의료진과 회복 상태를 확인해 주세요.",
          minPriceKrw: null,
          maxPriceKrw: null,
          priceObservations: [],
        },
      });
    }
  });
  return { procedures: procedureGuides.length };
}
