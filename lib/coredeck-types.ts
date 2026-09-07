export type QuickView = {
  one_liner?: string;
  classic_pattern?: string;
  key_discriminator?: string;
  essential_investigation_pattern?: string;
  management_principle?: string;
  red_flag?: string;
};

export type RecallPrompt = { prompt: string; answer: string };

export type ConditionCard = {
  card_id: string;
  condition_id: string;
  display_name: string;
  curriculum_tags?: string[];
  quick_view?: QuickView;
  recall_prompts?: RecallPrompt[];
  sections?: Record<string, string | string[]>;
  review_metadata?: Record<string, unknown>;
};

export type Condition = {
  id: string;
  name: string;
  aliases: string[];
  specialty: string | null;
  system: string | null;
  ageGroups: string[];
  presentationIds: string[];
  mustNotMissFor: string[];
  contrastConditionIds: string[];
  priority: string | null;
  curriculumStatus: string | null;
  clinicalReviewStatus: string | null;
  relationshipsReviewStatus: string | null;
  coverage: 'playable' | 'multiple_cases' | 'card_only' | 'uncovered';
  available: boolean;
  playableCaseIds: string[];
  card: ConditionCard | null;
  encounters: Array<{
    caseId: string;
    patientCardId: string;
    patientId: string;
    patientName: string;
    ageYears: number;
    presentationId: string;
    presentation: string;
    setting: string;
  }>;
};

export type Presentation = {
  id: string;
  name: string;
  aliases: string[];
  ageGroups: string[];
  typicalSettings: string[];
  coreConditionIds: string[];
  mustNotMissIds: string[];
  contrastSets: Array<{
    set_id: string;
    conditions: string[];
    rationales?: Record<string, string>;
    clinical_review_status?: string;
  }>;
  targetCaseCount: number | null;
  existingCaseIds: string[];
  coverageStatus: string | null;
  clinicalReviewStatus: string | null;
  relationshipsReviewStatus: string | null;
  notes: string | null;
  coreConditions: Array<{ id: string; name: string }>;
  mustNotMiss: Array<{ id: string; name: string }>;
};

export type MediaItem = {
  id: string;
  type: string;
  caseId: string;
  investigationId: string;
  investigationName: string;
  patientName: string;
  conditionId: string | null;
  conditionName: string;
  presentationId: string | null;
  altText: string;
  displayMode: string;
  clinicalReviewStatus: string;
  asset: string | null;
  result: null | {
    finding_text?: string;
    notebook_summary?: string;
    teaching_point?: string;
    measurements?: Array<Record<string, unknown>>;
  };
};

export type DeckData = {
  schemaVersion: number;
  product: string;
  source: {
    repository: string;
    revision: string | null;
    fingerprintSha256: string;
    reviewNotice: string;
  };
  stats: {
    curriculumConditions: number;
    playableConditions: number;
    uncoveredConditions: number;
    presentations: number;
    cases: number;
    patientCards: number;
    conditionCards: number;
    mediaRequirements: number;
    visualMedia: number;
    textOnlyMedia: number;
  };
  conditions: Condition[];
  presentations: Presentation[];
  media: MediaItem[];
  catalogues: Record<string, unknown>;
  progression: Record<string, unknown>;
};

export type StudyMode = 'conditions' | 'presentations' | 'compare' | 'images' | 'recall';
export type RecallRating = 'again' | 'hard' | 'good';

export type LearnerState = {
  savedConditionIds: string[];
  recallRatings: Record<string, { rating: RecallRating; reviewedAt: string }>;
};
