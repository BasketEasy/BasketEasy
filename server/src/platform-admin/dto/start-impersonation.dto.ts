import type { StartImpersonationRequest } from '@basketeasy/types/platform-admin-impersonation';
import { ReasonDto } from './admin-actions.dto';

export class StartImpersonationDto extends ReasonDto implements StartImpersonationRequest {}
