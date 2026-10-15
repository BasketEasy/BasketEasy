import type { ErasePlatformUserRequest } from '@basketeasy/types/platform-admin';
import { ReasonDto } from './admin-actions.dto';

export class ErasePlatformUserDto extends ReasonDto implements ErasePlatformUserRequest {}
