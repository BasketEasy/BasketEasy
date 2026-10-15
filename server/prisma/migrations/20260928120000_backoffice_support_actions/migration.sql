-- AlterEnum
-- One audit type for every back-office support action (the action itself is
-- metadata.action). Same ADD VALUE-inside-a-transaction note as
-- 20260928010000_add_platform_admin: nothing here writes a row using it.
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_SUPPORT_ACTION';

-- AlterEnum
-- A consent recorded by Kluvo staff on a club's behalf: not the club's own
-- staff attestation, nor a parent in the app.
ALTER TYPE "ParentalConsentSource" ADD VALUE 'PLATFORM_STAFF';
