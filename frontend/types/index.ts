export interface LandZone {
  name: string;
  law: string;
  category: string;
}

export interface LandParcelInfo {
  address: string;
  jimok: string;
  pblnt_pric: string;
  zones: LandZone[];
  error: string;
}

export interface LandInfoResult {
  parcels: LandParcelInfo[];
  merged_zones: LandZone[];
}

export interface ProjectFormData {
  location: string;
  zone: string;
  usage: string;
  site_area: number;
  bldg_area: number;
  total_area: number;
  floors: string;
  height: number;
  parking: number;
  units?: number;
  district?: string;
  height_limit?: string;
  parking_legal?: number;
  drawing_files?: string[];
}

export type ReviewStatus = 'pass' | 'fail' | 'warn';

export interface ReviewItem {
  name: string;
  status: ReviewStatus;
  detail: string;
  law: string;
}

export interface ReviewCategory {
  name: string;
  items: ReviewItem[];
}

export interface ReviewSummary {
  passed: number;
  failed: number;
  warned: number;
}

export interface ReviewResult {
  summary: ReviewSummary;
  categories: ReviewCategory[];
}
