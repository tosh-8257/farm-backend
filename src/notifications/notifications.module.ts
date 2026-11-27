import { Module } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { EcosystemNotifyService } from './ecosystem-notify.service';

import { NotificationsController } from './notifications.controller';

import { FirebaseService } from './firebase.service';

@Module({
  controllers: [NotificationsController],

  providers: [NotificationsService, FirebaseService, EcosystemNotifyService],

  exports: [NotificationsService, FirebaseService, EcosystemNotifyService],
})
export class NotificationsModule {}
