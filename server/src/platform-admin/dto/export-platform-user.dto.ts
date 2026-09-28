import type { ExportPlatformUserRequest } from '@basketeasy/types/platform-admin';
import { ReasonDto } from './admin-actions.dto';

// Same reason rule as erasure and every support action: an export puts a
// complete copy of one person's data outside the system, so the recorded
// justification is what makes the ADMIN_EXPORT_GENERATED row usable as
// evidence rather than a bare timestamp.
export class ExportPlatformUserDto extends ReasonDto implements ExportPlatformUserRequest {}
