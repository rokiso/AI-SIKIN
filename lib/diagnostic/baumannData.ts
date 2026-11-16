export const axisLabels = {
  oiliness: "유·수분 밸런스",
  sensitivity: "민감도",
  pigmentation: "색소침착 경향",
  elasticity: "탄력·주름",
} as const;
export type BaumannAxis = keyof typeof axisLabels;
export type BaumannQuestion = {
  id: string;
  axis: BaumannAxis;
  text: string;
  choices: readonly string[];
};
// Original short self-assessment prompts, not the licensed/validated BSTI questionnaire.
export const baumannQuestions: readonly BaumannQuestion[] = [
  {
    id: "Q01",
    axis: "oiliness",
    text: "세안 후 아무것도 바르지 않으면 피부는 어떤가요?",
    choices: [
      "얼굴 전체가 많이 당겨요",
      "조금 당기는 편이에요",
      "편안하거나 T존만 번들거려요",
      "얼굴 전체가 금방 번들거려요",
    ],
  },
  {
    id: "Q02",
    axis: "oiliness",
    text: "오후가 되면 얼굴의 유분은 어떤가요?",
    choices: [
      "거의 없고 건조해요",
      "유분이 적은 편이에요",
      "이마와 코 위주로 생겨요",
      "얼굴 전체에 많이 생겨요",
    ],
  },
  {
    id: "Q03",
    axis: "oiliness",
    text: "보습제를 바른 뒤 피부는 어떤가요?",
    choices: [
      "덧발라도 쉽게 건조해요",
      "시간이 지나면 건조해져요",
      "대체로 편안하게 유지돼요",
      "쉽게 번들거리거나 무겁게 느껴져요",
    ],
  },
  {
    id: "Q04",
    axis: "sensitivity",
    text: "새 화장품을 쓸 때 따갑거나 붉어지나요?",
    choices: ["거의 없어요", "드물게 있어요", "종종 있어요", "자주 있어요"],
  },
  {
    id: "Q05",
    axis: "sensitivity",
    text: "온도 변화나 바람에 피부가 쉽게 붉어지나요?",
    choices: ["거의 없어요", "드물게 있어요", "종종 있어요", "자주 있어요"],
  },
  {
    id: "Q06",
    axis: "sensitivity",
    text: "평소 피부에 가려움이나 화끈거림이 있나요?",
    choices: ["거의 없어요", "드물게 있어요", "종종 있어요", "자주 있어요"],
  },
  {
    id: "Q07",
    axis: "pigmentation",
    text: "트러블이 가라앉은 뒤 갈색 자국이 남나요?",
    choices: [
      "거의 남지 않아요",
      "옅게 남다가 금방 사라져요",
      "자주 남고 천천히 옅어져요",
      "진하게 남고 오래 지속돼요",
    ],
  },
  {
    id: "Q08",
    axis: "pigmentation",
    text: "햇빛에 노출된 뒤 피부가 어두워지는 편인가요?",
    choices: [
      "거의 변하지 않아요",
      "조금 변해도 금방 돌아와요",
      "쉽게 어두워지는 편이에요",
      "쉽게 어두워지고 오래 지속돼요",
    ],
  },
  {
    id: "Q09",
    axis: "pigmentation",
    text: "기미·잡티처럼 갈색으로 보이는 부분이 신경 쓰이나요?",
    choices: [
      "거의 없어요",
      "조금 있지만 신경 쓰이지 않아요",
      "여러 곳이 신경 쓰여요",
      "넓거나 진한 부분이 많이 신경 쓰여요",
    ],
  },
  {
    id: "Q10",
    axis: "elasticity",
    text: "표정을 짓지 않을 때 눈가나 이마의 잔주름이 보이나요?",
    choices: [
      "거의 보이지 않아요",
      "가까이 보면 조금 보여요",
      "여러 곳에서 보여요",
      "뚜렷하게 보여요",
    ],
  },
  {
    id: "Q11",
    axis: "elasticity",
    text: "최근 피부의 탄력 저하가 느껴지나요?",
    choices: ["거의 느껴지지 않아요", "약간 느껴져요", "눈에 띄게 느껴져요", "많이 느껴져요"],
  },
  {
    id: "Q12",
    axis: "elasticity",
    text: "충분히 보습해도 피부의 잔주름이 계속 보이나요?",
    choices: ["거의 보이지 않아요", "드물게 보여요", "자주 보여요", "항상 뚜렷하게 보여요"],
  },
];
