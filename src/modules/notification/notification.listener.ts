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
    private readonly eventEmitter: EventEmitter2) { }

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
      message: `${payload.content}`,
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
      message: `${payload.content.substring(0, 100)}`,
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
      message: payload.content.substring(0, 100),
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
      message: `${payload.content}`,
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
      message: `${payload.content}`,
      content: payload.postId,
    });
  }

  @OnEvent('community.post.pending')
  async handleCommunityPostPending(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_POST_PENDING,
      targetId: payload.postId,
      message: ` đã gửi yêu cầu đăng bài vào cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.join.request')
  async handleCommunityJoinRequest(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_JOIN_REQUEST,
      targetId: payload.requestId,
      message: ` đã gửi yêu cầu tham gia cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.auto.join')
  async handleCommunityAutoJoin(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_PUBLIC_JOIN,
      targetId: payload.communityId,
      message: ` đã tham gia cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.join.approved')
  async handleCommunityJoinApproved(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_JOIN_APPROVED,
      targetId: payload.communityId,
      message: `Admin đã chấp nhận yêu cầu tham gia cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.join.rejected')
  async handleCommunityJoinRejected(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_JOIN_REJECTED,
      targetId: payload.communityId,
      message: `Admin đã từ chối yêu cầu tham gia cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.invite')
  async handleCommunityInvite(payload: any) {

    console.log('NotificationListener - handleCommunityInvite - payload:', payload);
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_INVITE,
      targetId: payload.targetId,
      message: payload.message,
      content: payload.content,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.post.approved')
  async handleCommunityPostApproved(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_POST_APPROVED,
      targetId: payload.postId,
      message: `Admin đã duyệt bài viết của bạn trong cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
    });
  }

  @OnEvent('community.post.rejected')
  async handleCommunityPostRejected(payload: any) {
    await this.notificationService.createAndEmit({
      receiver: payload.receiver,
      sender: payload.sender,
      type: NotificationType.COMMUNITY_POST_REJECTED,
      targetId: payload.postId,
      message: `Admin đã từ chối bài viết của bạn trong cộng đồng `,
      content: payload.communityName,
      communityId: payload.communityId,
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
      message: `${payload.suggestedUserIds.length}`,
      content: JSON.stringify(payload.suggestedUserIds),
    });
  }
}
