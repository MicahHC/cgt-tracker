import { CommercialBuildoutStatus, ConfidenceLevel, LikelyLaunch24, LockStatus, ManufacturingPathway, ManufacturingStatus, Segment, Tier, UserRole } from '../types/database';

export const SEGMENTS: Segment[] = ['Late Stage', 'Early Stage', 'On-Market'];
export const TIERS: Tier[] = ['Tier 1', 'Tier 2', 'Watchlist', 'Deprioritized'];
export const MANUFACTURING_STATUSES: ManufacturingStatus[] = ['Established', 'Scaling', 'Early', 'Constrained', 'Critical Gap'];
export const MANUFACTURING_PATHWAYS: ManufacturingPathway[] = ['Yes', 'No', 'Unclear'];
export const COMMERCIAL_BUILDOUTS: CommercialBuildoutStatus[] = ['Established', 'Scaling', 'Early', 'Minimal', 'None'];
export const LIKELY_LAUNCH_24: LikelyLaunch24[] = ['Yes', 'No', 'Watchlist'];
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['High', 'Medium', 'Low'];
export const LOCK_STATUSES: LockStatus[] = ['Open', 'In Progress', 'Complete'];
export const USER_ROLES: UserRole[] = ['admin', 'analyst', 'viewer'];

export const SIGNAL_TYPES = [
  'regulatory',
  'clinical',
  'manufacturing',
  'commercial buildout',
  'executive hire',
  'market access',
  'partnership',
  'financing',
  'risk event',
];

export const SOURCE_TYPES = [
  'investor relations',
  'press release',
  'SEC filing',
  'FDA',
  'ClinicalTrials.gov',
  'trade press',
  'other',
];
