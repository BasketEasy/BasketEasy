import { Prisma } from '@prisma/client';

/**
 * Erasing an account (the nightly sweep, or a data officer's manual RGPD
 * erasure) is one `user.deleteMany` inside `RetentionService.eraseUserAccount`.
 * Everything hanging off the User row — guardian links, TeamAdmin grants,
 * memberships, sessions — is removed or detached by the database, not by
 * application code, so a mocked unit test can't see it. This pins the schema
 * instead: a relation to User left on Prisma's default (RESTRICT for a
 * required field) turns every erasure into a foreign-key violation, which is
 * exactly what ClubMembership and RefreshToken did until they were fixed.
 */
describe('User erasure (schema)', () => {
  const relationsToUser = Prisma.dmmf.datamodel.models.flatMap((model) =>
    model.fields
      .filter((field) => field.type === 'User' && (field.relationFromFields?.length ?? 0) > 0)
      .map((field) => ({
        relation: `${model.name}.${field.name}`,
        onDelete: field.relationOnDelete,
      })),
  );

  it('finds the relations it is meant to police', () => {
    expect(relationsToUser.map((r) => r.relation)).toEqual(
      expect.arrayContaining([
        'ClubMembership.user',
        'RefreshToken.user',
        'PlayerGuardian.user',
        'GuardianInvite.acceptedBy',
        'EventRsvp.respondedBy',
        'ParentalConsent.attestedByUser',
      ]),
    );
  });

  it('declares every relation to User as Cascade or SetNull, explicitly', () => {
    const blocking = relationsToUser.filter(
      (r) => r.onDelete !== 'Cascade' && r.onDelete !== 'SetNull',
    );
    expect(blocking).toEqual([]);
  });

  it.each([
    // A parent's link to a child is the parent's data and goes with them.
    ['PlayerGuardian.user', 'Cascade'],
    ['TeamAdmin.user', 'Cascade'],
    ['ClubMembership.user', 'Cascade'],
    ['RefreshToken.user', 'Cascade'],
    // The club's records survive, detached from the erased account.
    ['Player.user', 'SetNull'],
    ['EventRsvp.respondedBy', 'SetNull'],
    ['GuardianInvite.acceptedBy', 'SetNull'],
    ['GuardianInvite.createdBy', 'SetNull'],
    // Proof of consent outlives the account (RGPD art. 17.3.b).
    ['ParentalConsent.attestedByUser', 'SetNull'],
    ['AuditLog.user', 'SetNull'],
  ])('%s is %s', (relation, onDelete) => {
    expect(relationsToUser.find((r) => r.relation === relation)?.onDelete).toBe(onDelete);
  });
});
