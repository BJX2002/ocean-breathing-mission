import type { DepthZone } from './common';

/**
 * Functional groups describe how an organism tends to respond to changing
 * dissolved oxygen. They drive *simulation rules*, never hard-coded deletions.
 * See docs/SCIENCE_RULES.md.
 */
export type FunctionalGroup =
  | 'strongly-mobile-fish'
  | 'habitat-associated-fish'
  | 'benthic-invertebrate'
  | 'tolerant-organism';

/** Qualitative abundance category (never a precise historical count). */
export type AbundanceCategory = 'abundant' | 'common' | 'occasional' | 'rare';

/** Relative mobility of the organism. */
export type Mobility = 'high' | 'medium' | 'low';

/** Qualitative tolerance to low oxygen. */
export type OxygenTolerance = 'low' | 'moderate' | 'high';

/**
 * Survey status uses evidence-safe wording. "not-observed" NEVER means extinct.
 * See docs/SCIENCE_RULES.md.
 */
export type SurveyStatus =
  | 'still-observed'
  | 'less-frequently-observed'
  | 'shifted-distribution'
  | 'not-observed';

export interface Species {
  readonly id: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly functionalGroup: FunctionalGroup;
  readonly abundanceCategory: AbundanceCategory;
  readonly mobility: Mobility;
  readonly preferredDepthZone: DepthZone;
  readonly oxygenTolerance: OxygenTolerance;
  readonly surveyStatus: SurveyStatus;
}
