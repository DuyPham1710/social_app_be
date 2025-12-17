import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';
import { InjectModel } from '@nestjs/mongoose';
import { PostDocument, Post } from '../post/schemas/post.schema';
import { Model } from 'mongoose';

@Injectable()
export class NotificationListener {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private readonly notificationService: NotificationService) {}

  @OnEvent('friend.request')
  async handleFriendRequest(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.FRIEND_REQUEST,
      targetId: payload.requestId,
      message: 'Bạn có lời mời kết bạn mới',
      content: '',
    });
  }

  @OnEvent('comment.created')
  async handleCommentCreated(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.POST_COMMENT,
      targetId: payload.commentId,
      content: payload.content,
      message: ` đã bình luận về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
    });
  }

  @OnEvent('react.created')
  async handleReactCreated(payload: any) {
    const post = await this.postModel.findById(payload.postId).select('userId');
    if (!post) return; 

    const ownerId = post.userId.toString();

    console.log('NotificationListener - handleReactCreated - ownerId:', ownerId, ' payload.sender:', payload.sender);

    if (ownerId === payload.sender) return;

    await this.notificationService.createAndEmit({
      receiver: ownerId,
      sender: payload.sender,
      type: NotificationType.POST_REACTION,
      targetId: payload.reactId,
      message: ` đã bày tỏ cảm xúc về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.content,
    });
  }
}
