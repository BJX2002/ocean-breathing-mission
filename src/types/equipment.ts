/** Diver equipment categories (Chapter 1 survey tools). */
export type EquipmentCategory = 'photography' | 'navigation' | 'scanning' | 'sampling';

export interface Equipment {
  readonly id: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly category: EquipmentCategory;
  /** How many equipment slots this tool occupies (trade-off design). */
  readonly slotCost: number;
  /** Battery drained per second while active. */
  readonly batteryDrainPerSecond: number;
  readonly descriptionEn: string;
  readonly descriptionZh: string;
}
