import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';
import { InjectModel } from '@nestjs/mongoose';
import { PostDocument, Post } from '../post/schemas/post.schema';
import { Model } from 'mongoose';
import { Story, StoryDocument } from '../story/schemas/story.schema';
import { Comment, CommentDocument } from '../comment/schemas/comment.schema';

@Injectable()
export class NotificationListener {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
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
      message: ` đã bình luận về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.postId,
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
      targetId: payload.postId,
      message: ` đã bày tỏ cảm xúc về bài viết của bạn: "${payload.content.substring(0, 100)}"`,
      content: payload.content,
    });
  }

  @OnEvent('react.story.created')
  async handleReactStoryCreated(payload: any) {
    const story = await this.storyModel.findById(payload.storyId).select('userId');
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
    const comment = await this.commentModel.findById(payload.commentId).select('userId');
    if (!comment) return; 

    const ownerId = comment.userId.toString();

    console.log('NotificationListener - handleReactCommentCreated - ownerId:', ownerId, ' payload.sender:', payload.sender);

    const post = await this.commentModel.findById(payload.commentId).select('postId');
    if (ownerId === payload.sender) return;

    await this.notificationService.createAndEmit({
          receiver: comment.userId.toString(),
          sender: payload.sender,
          type: NotificationType.COMMENT_REACTION,
          targetId: payload.commentId,         
          message: `đã thả cảm xúc về bình luận của bạn: "${payload.content}"`,
          content: post?.postId.toString() || '',
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
}
