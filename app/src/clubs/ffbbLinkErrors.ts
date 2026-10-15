import type { FfbbLinkErrorCode } from '@basketeasy/types/ffbb';
import { ApiError } from '../api/client';

const FFBB_LINK_ERROR_CODES: FfbbLinkErrorCode[] = ['FFBB_LINK_INVALID', 'FFBB_LINK_UNREACHABLE'];

/** True when `err` is a bad-shape/unreachable FFBB-link validation failure — the frontend then binds it to the field instead of a generic error surface. */
export function isFfbbLinkError(err: unknown): err is ApiError & { code: FfbbLinkErrorCode } {
  return (
    err instanceof ApiError &&
    !!err.code &&
    FFBB_LINK_ERROR_CODES.includes(err.code as FfbbLinkErrorCode)
  );
}
