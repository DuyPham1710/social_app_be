import { Controller, Get, Param, Patch } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get(':userId')
  async getNotifications(@Param('userId') userId: string) {
    return this.notificationService.getUserNotifications(userId);
  }

  @Patch('read/:id')
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }
}
