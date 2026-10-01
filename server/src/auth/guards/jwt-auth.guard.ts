import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IMPERSONATION_STRATEGY } from '../strategies/impersonation.strategy';

/**
 * An ordinary access token, or a back-office impersonation token. Each is
 * signed with its own secret, so a token is accepted by exactly one of the
 * two strategies. The impersonation one is where read-only is enforced, so
 * every route behind this guard is covered without an annotation to forget.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', IMPERSONATION_STRATEGY]) {}
