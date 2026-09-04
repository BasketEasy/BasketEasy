import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { NotificationList, VapidPublicKeyResponse } from '@basketeasy/types/notifications';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { DeletePushSubscriptionDto } from './dto/delete-push-subscription.dto';

// Not club-scoped, same reasoning as MyTeamsController and DashboardController
// — "my notifications" spans every club and team the caller is part of, so
// there is no :clubId in the URL to key it off.
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsDto,
  ): Promise<NotificationList> {
    return this.notifications.list(user.id, query);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    return this.notifications.markRead(user.id, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: RequestUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }
}

// Its own controller rather than more routes on the one above: a push
// subscription is a property of the *browser*, not of the notification feed,
// and it is created and destroyed by a completely different part of the UI
// (the preferences toggle, not the bell).
@Controller('me/push-subscriptions')
@UseGuards(JwtAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly notifications: NotificationsService) {}

  // The VAPID *public* key is not a secret — it is sent to every browser that
  // subscribes. Kept behind the guard anyway since nothing outside the app has
  // any use for it.
  @Get('public-key')
  getPublicKey(): VapidPublicKeyResponse {
    return { publicKey: this.notifications.getPushPublicKey() };
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  subscribe(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.notifications.savePushSubscription(
      user.id,
      { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      userAgent,
    );
  }

  // A body on DELETE rather than the endpoint in the path: a push endpoint is
  // a full https URL up to 2 KB long, which does not survive being a path
  // segment.
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribe(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeletePushSubscriptionDto,
  ): Promise<void> {
    return this.notifications.deletePushSubscription(user.id, dto.endpoint);
  }
}
