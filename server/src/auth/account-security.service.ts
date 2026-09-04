import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken } from '../common/token-hash';

// A verification link is long-lived: it is opened from an inbox, sometimes
// the next day, and re-requesting it costs the user nothing. A reset link is
// short-lived on purpose — it is a live path into the account, so an old
// e-mail sitting in a mailbox stops being a key within the hour.
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// Cheapest possible resend throttle: a second request inside this window
// reuses nothing and sends nothing. It exists to stop a held-down "renvoyer"
// button turning into a mail-bomb against the address, not to defeat a
// determined attacker — the endpoints are already 204-always, so there is no
// signal to farm by hammering them.
const RESEND_THROTTLE_MS = 60 * 1000;

@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Issues a verification token and e-mails it.
   *
   * Resolves even when nothing was sent (already verified, or throttled) —
   * every caller is either a fire-and-forget side effect of registration or
   * a 204-always endpoint, and neither has anywhere to put an error.
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;

    const recent = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, createdAt: { gt: new Date(Date.now() - RESEND_THROTTLE_MS) } },
      select: { id: true },
    });
    if (recent) {
      this.logger.debug(`Verification e-mail for ${userId} throttled`);
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        email: user.email,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    this.mail.sendAndForget(
      () => this.mail.sendVerificationEmail(user.email, rawToken),
      `verification e-mail to ${user.email}`,
    );
  }

  /**
   * Consumes a verification token and marks the address confirmed.
   *
   * Unlike the reset flow this one *does* report failure: the visitor is
   * looking at a page that has to say whether their link worked, and a
   * verification token reveals nothing about which addresses have accounts.
   */
  async confirmEmail(rawToken: string): Promise<void> {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
    });

    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Ce lien de confirmation est invalide ou a expiré');
    }

    // The address moved since this link was sent, so confirming would mark
    // an address nobody has proved they control. Re-requesting from the app
    // sends a fresh link for the current address.
    if (token.email !== token.user.email) {
      throw new BadRequestException(
        'Ce lien ne correspond plus à l’adresse de votre compte. Demandez un nouvel e-mail de confirmation.',
      );
    }

    // Already verified: consume the token and say nothing. Clicking the same
    // link twice is not an error the user needs to see.
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }

  /**
   * Always resolves, whether or not the address has an account.
   *
   * That is the whole point: a reset form that answers differently for a
   * known and an unknown address is a user-enumeration oracle, and this one
   * is public and unauthenticated.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      this.logger.debug('Password reset requested for an unknown address');
      return;
    }

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_THROTTLE_MS) } },
      select: { id: true },
    });
    if (recent) return;

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    this.mail.sendAndForget(
      () => this.mail.sendPasswordResetEmail(user.email, rawToken),
      `password reset e-mail to ${user.email}`,
    );
  }

  /**
   * Sets a new password from a reset token and ends every existing session.
   *
   * Revoking the whole RefreshToken set is the part that makes this a
   * recovery flow rather than a convenience: the common reason to reset is
   * that someone else may have the old password, and leaving their sessions
   * alive would defeat the reset entirely.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Ce lien de réinitialisation est invalide ou a expiré');
    }

    const passwordHash = await argon2.hash(newPassword);

    // An interactive transaction rather than the array form, because the
    // claim has to be *checked* before the password is written: two clicks
    // racing on the same link both pass the findUnique above, and the loser
    // must not get to set a password of its own. Claiming the row with a
    // `consumedAt: null` filter and refusing on a zero count is the same
    // pattern AuthService.refresh uses for refresh-token reuse and
    // InvitesService uses for a double-claimed player.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('Ce lien de réinitialisation est invalide ou a expiré');
      }

      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Any other outstanding reset link is dead the moment one is used.
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
  }
}
