import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';

@Injectable()
export class NotificationListener {
  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent('friend.request')
  async handleFriendRequest(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.FRIEND_REQUEST,
      targetId: payload.requestId,
      message: 'Bạn có lời mời kết bạn mới',
    });
  }

  @OnEvent('comment.created')
  async handleCommentCreated(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.POST_COMMENT,
      targetId: payload.commentId,
      message: `${payload.user.fullName || payload.user.username} đã bình luận: "${payload.content.substring(0, 100)}"`,
    });
  }
}
