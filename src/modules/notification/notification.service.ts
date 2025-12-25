import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationGateway } from './notification.gateway';
import { NotificationResponse } from './dto/notification-response.dto';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from 'src/shared/enums/notification_type';
import { FcmService } from 'src/shared/services/fcm.service';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,

    private readonly eventEmitter: EventEmitter2,
    private readonly fcmService: FcmService,

  ) {}

  private toObjectId(id: string) {
    return new Types.ObjectId(id);
  }

  async create(dto: CreateNotificationDto) {
  const n = new this.notificationModel({
    receiver: this.toObjectId(dto.receiver),
    sender: dto.sender ? this.toObjectId(dto.sender) : undefined,
    type: dto.type,
    targetId: dto.targetId ? this.toObjectId(dto.targetId) : undefined,
    message: dto.message,
    content: dto.content,
    isRead: false,
  });

  let saved = await n.save();

  // Populate sender
  saved = await saved.populate({
    path: 'sender',
    select: 'username fullName avatarUrl _id'
  });

  return saved;
}

// create + emit to receiver
async createAndEmit(dto: CreateNotificationDto) {

  console.log(">>> Creating notification for owner:", dto.receiver?.toString());
  const saved = await this.create(dto);

  const sender: any = saved.sender;
  const payload = {
    _id: saved._id.toString(),
    receiver: saved.receiver.toString(),
    sender: sender
      ? {
          userId: sender._id,
          username: sender.username,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : null,
    type: saved.type,
    targetId: saved.targetId ? saved.targetId.toString() : null,
    message: saved.message,
    content: saved.content,
    isRead: saved.isRead,
    createdAt: saved.createdAt!.toISOString(),
  };

  try {
    this.gateway.emitToUser(dto.receiver, 'notification:new', payload);
    try {
      await this.sendFcmNotification(dto.receiver, saved);
    } catch (err) {
      this.logger.log(`FCM failed: ${err}`);
    }
  } catch (err) {
    this.logger.log(`Emit failed or user offline: ${err?.message || err}`);
  }

  return payload;
}

  async findByUser(userId: string, limit = 20, page = 1) {
    const skip = (page - 1) * limit;
    const q = { receiver: this.toObjectId(userId) };

    const raw = await this.notificationModel
      .find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'sender',
        select: 'username fullName avatarUrl _id',
      })
      .lean()
      .exec();

    const items = raw.map((n: any) => ({
      _id: n._id.toString(),
      receiver: n.receiver.toString(),

      sender: n.sender
        ? {
            userId: n.sender._id,
            username: n.sender.username,
            fullName: n.sender.fullName,
            avatarUrl: n.sender.avatarUrl,
          }
        : null,

      type: n.type,
      targetId: n.targetId ? n.targetId.toString() : null,
      message: n.message,
      content: n.content,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    const total = await this.notificationModel.countDocuments(q);
    const unread = await this.notificationModel.countDocuments({
      ...q,
      isRead: false,
    });

    return { items, total, unread, page, limit };
  }

  async delete(notificationId: string, userId: string) {
    const n = await this.notificationModel.findById(notificationId);
    if (!n) throw new NotFoundException('Notification not found');
    if (n.receiver.toString() !== userId) throw new NotFoundException('Not allowed');

    await this.notificationModel.deleteOne({ _id: n._id });

    // notify client's other sockets if needed
    this.gateway.emitToUser(userId, 'notification:deleted', { id: notificationId });
    return { ok: true };
  }

  async countUnread(userId: string) {
    return this.notificationModel.countDocuments({ receiver: this.toObjectId(userId), isRead: false });
  }

  async markRead(notificationId: string, userId: string) {
    const n = await this.notificationModel.findById(notificationId);
    if (!n) throw new NotFoundException('Notification not found');
    if (n.receiver.toString() !== userId) throw new NotFoundException('Not allowed');

    n.isRead = true;
    await n.save();
    // optionally notify client about change
    this.gateway.emitToUser(userId, 'notification:read', { id: notificationId });
    return n;
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany({ receiver: this.toObjectId(userId), isRead: false }, { $set: { isRead: true } });
    this.gateway.emitToUser(userId, 'notification:markAllRead', { userId });
  }

  private async sendFcmNotification(
    receiverId: string,
    notification: NotificationDocument,
  ) {
    try {
      // Get user's FCM token
      const [user] = await this.eventEmitter.emitAsync(AppEvents.USER_GET_FCM_TOKEN, { userId: receiverId });
      //const user = await this.userModel.findById(receiverId).select('fcmToken');
      
      if (!user || !user.fcmToken) {
        this.logger.log(`No FCM token found for user: ${receiverId}`);
        return;
      }

      const sender: any = notification.sender;
      
      // Use FCM Service to send notification
      await this.fcmService.sendAppNotification({
        fcmToken: user.fcmToken,
        type: notification.type,
        notificationId: (notification as any)._id.toString(),
        targetId: notification.targetId?.toString(),
        senderId: sender?._id?.toString(),
        senderName: sender?.fullName || sender?.username || 'Someone',
        senderAvatar: sender?.avatarUrl,
        message: notification.message,
        content: notification.content,
      });

      this.logger.log(`FCM notification sent successfully to user ${receiverId}`);
    } catch (error) {
      this.logger.error(
        `Error sending FCM notification to user ${receiverId}: ${error.message}`,
        error.stack,
      );
      // Don't throw - notification should not block the main flow
    }
  }

}
