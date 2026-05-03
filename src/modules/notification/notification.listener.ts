import { Injectable } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';
import { emit } from 'process';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2) {}

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
      message: ` đã bình luận về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.postId,
    });
  }

  @OnEvent('react.created')
  async handleReactCreated(payload: any) {
    const [post] = await this.eventEmitter.emitAsync(AppEvents.POST_GET_USER_ID, { postId: payload.postId });
    if (!post) return;
    const ownerId = post.userId.toString();

    console.log('NotificationListener - handleReactCreated - ownerId:', ownerId, ' payload.sender:', payload.sender);

    if (ownerId === payload.sender) return;

    await this.notificationService.createAndEmit({
      receiver: ownerId,
      sender: payload.sender,
      type: NotificationType.POST_REACTION,
      targetId: payload.postId,
      message: ` đã bày tỏ cảm xúc về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.content,
    });
  }

  @OnEvent('react.story.created')
  async handleReactStoryCreated(payload: any) {
    const [story] = await this.eventEmitter.emitAsync(AppEvents.STORY_GET_USER_ID, { storyId: payload.storyId });
    if (!story) return; 

    const ownerId = story.userId.toString();

    console.log('NotificationListener - handleReactStoryCreated - ownerId:', ownerId, ' payload.sender:', payload.sender);

    if (ownerId === payload.sender) return;

    await this.notificationService.createAndEmit({
      receiver: ownerId,
      sender: payload.sender,
      type: NotificationType.STORY_REACTION,
      targetId: payload.storyId,
      message: ` đã bày tỏ cảm xúc về tin của bạn của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.content,
    });
  }

  @OnEvent('react.comment.created')
  async handleReactCommentCreated(payload: any) {
    const [comment] = await this.eventEmitter.emitAsync(AppEvents.COMMENT_GET_USER_ID, { commentId: payload.commentId });

    if (!comment) return; 

    const ownerId = comment.userId.toString();

    console.log('NotificationListener - handleReactCommentCreated - ownerId:', ownerId, ' payload.sender:', payload.sender);


    if (ownerId === payload.sender) return;

    await this.notificationService.createAndEmit({
          receiver: comment.userId.toString(),
          sender: payload.sender,
          type: NotificationType.COMMENT_REACTION,
          targetId: payload.commentId,         
          message: `đã thả cảm xúc về bình luận của bạn: "${payload.content}"`,
          content: comment?.postId.toString() || '',
      });
  }

  @OnEvent('comment.tagged')
  async handleCommentTagged(payload: any) {
      await this.notificationService.createAndEmit({
          receiver: payload.receiver,
          sender: payload.sender,
          type: NotificationType.POST_COMMENT,
          targetId: payload.commentId,         
          message: `đã nhắc đến bạn trong một bình luận: "${payload.content}"`,
          content: payload.postId,
      });

  }

  @OnEvent(AppEvents.FACE_DETECTED_IN_POST)
  async handleFaceDetected(payload: { receiver: string; sender: string; postId: string }) {
      await this.notificationService.createAndEmit({
          receiver: payload.receiver,
          sender: payload.sender,
          type: NotificationType.FACE_DETECTED,
          targetId: payload.postId,
          message: 'đã đăng một bài viết có mặt bạn',
          content: '',
      });
  }

  @OnEvent(AppEvents.POST_TAGGED)
  async handlePostTagged(payload: { receiver: string; sender: string; postId: string }) {
      await this.notificationService.createAndEmit({
          receiver: payload.receiver,
          sender: payload.sender,
          type: NotificationType.TAG_POST,
          targetId: payload.postId,
          message: 'đã gắn thẻ bạn trong một bài viết',
          content: '',
      });
  }

  @OnEvent(AppEvents.FACE_TAG_SUGGEST)
  async handleFaceTagSuggest(payload: {
      receiver: string;
      postId: string;
      suggestedUserIds: string[];
  }) {
      await this.notificationService.createAndEmit({
          receiver: payload.receiver,
          type: NotificationType.FACE_TAG_SUGGEST,
          targetId: payload.postId,
          message: `Nhận diện ${payload.suggestedUserIds.length} người trong ảnh của bạn. Gắn thẻ ngay!`,
          content: JSON.stringify(payload.suggestedUserIds),
      });
  }
}
