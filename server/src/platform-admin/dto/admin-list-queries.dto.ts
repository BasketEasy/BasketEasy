import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AdminBooleanParam,
  AdminClubMembersQuery,
  AdminClubsQuery,
  AdminEventsQuery,
  AdminPlayersQuery,
  AdminScoresheetsQuery,
  AdminTeamsQuery,
  AdminUsersQuery,
} from '@basketeasy/types/platform-admin-browse';
import type { AdminSearchQuery } from '@basketeasy/types/platform-admin-search';
import {
  ADMIN_STATS_RANGES,
  type AdminStatsQuery,
  type AdminStatsRange,
} from '@basketeasy/types/platform-admin-stats';
import type { ClubRole } from '@basketeasy/types/club-members';
import type { EventScoresheetStatus, EventType } from '@basketeasy/types/events';
import type { Gender, TeamCategory } from '@basketeasy/types/teams';

// Query DTOs for every back-office list. One file rather than one per list:
// they share the paging, boolean and search conventions below, and none is
// used anywhere else.

const BOOLEANS: AdminBooleanParam[] = ['true', 'false'];
const ORDERS = ['asc', 'desc'] as const;
const CLUB_ROLES: ClubRole[] = ['ADMIN', 'MEMBER'];
const CATEGORIES: TeamCategory[] = ['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIORS'];
const GENDERS: Gender[] = ['MEN', 'WOMEN'];
const EVENT_TYPES: EventType[] = ['TRAINING', 'MATCH'];
const SCORESHEET_STATUSES: EventScoresheetStatus[] = [
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'PARSED',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'FAILED',
];
const STATUS_LIST = new RegExp(
  `^(${SCORESHEET_STATUSES.join('|')})(,(${SCORESHEET_STATUSES.join('|')}))*$`,
);

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class AdminPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AdminClubsQueryDto extends AdminPageDto implements AdminClubsQuery {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(BOOLEANS)
  hasAdmin?: AdminBooleanParam;

  @IsOptional()
  @IsIn(['name', 'createdAt'])
  sort?: 'name' | 'createdAt';

  @IsOptional()
  @IsIn(ORDERS)
  order?: 'asc' | 'desc';
}

export class AdminClubMembersQueryDto extends AdminPageDto implements AdminClubMembersQuery {
  @IsOptional()
  @IsIn(CLUB_ROLES)
  role?: ClubRole;
}

export class AdminTeamsQueryDto extends AdminPageDto implements AdminTeamsQuery {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: TeamCategory;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsIn(BOOLEANS)
  hasAdmin?: AdminBooleanParam;
}

export class AdminUsersQueryDto extends AdminPageDto implements AdminUsersQuery {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsIn(CLUB_ROLES)
  clubRole?: ClubRole;

  @IsOptional()
  @IsIn(BOOLEANS)
  verified?: AdminBooleanParam;

  @IsOptional()
  @IsIn(BOOLEANS)
  inactiveSoon?: AdminBooleanParam;

  @IsOptional()
  @IsIn(BOOLEANS)
  isGuardian?: AdminBooleanParam;

  @IsOptional()
  @IsIn(BOOLEANS)
  hasPlatformRole?: AdminBooleanParam;

  @IsOptional()
  @IsIn(['createdAt', 'lastActiveAt'])
  sort?: 'createdAt' | 'lastActiveAt';

  @IsOptional()
  @IsIn(ORDERS)
  order?: 'asc' | 'desc';
}

export class AdminPlayersQueryDto extends AdminPageDto implements AdminPlayersQuery {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsIn(BOOLEANS)
  claimed?: AdminBooleanParam;

  @IsOptional()
  @IsIn(BOOLEANS)
  minor?: AdminBooleanParam;

  @IsOptional()
  @IsIn(BOOLEANS)
  missingConsent?: AdminBooleanParam;
}

export class AdminEventsQueryDto extends AdminPageDto implements AdminEventsQuery {
  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: EventType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(SCORESHEET_STATUSES)
  scoresheetStatus?: EventScoresheetStatus;
}

export class AdminScoresheetsQueryDto extends AdminPageDto implements AdminScoresheetsQuery {
  @IsOptional()
  @Matches(STATUS_LIST)
  status?: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** Length is checked by the service, so the 400 carries its French message. */
export class AdminSearchQueryDto implements AdminSearchQuery {
  @Transform(trim)
  @IsString()
  q!: string;
}

export class AdminStatsQueryDto implements AdminStatsQuery {
  @IsOptional()
  @IsIn(ADMIN_STATS_RANGES)
  range?: AdminStatsRange;

  @IsOptional()
  @IsUUID()
  clubId?: string;
}
