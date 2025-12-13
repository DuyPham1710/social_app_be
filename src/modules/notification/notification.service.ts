import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationGateway } from './notification.gateway';
import { NotificationResponse } from './dto/notification-response.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from 'src/shared/enums/notification_type';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,

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

  // const payload = {
  //   id: saved._id.toString(),
  //   receiver: saved.receiver.toString(),
  //   sender: sender ? {
  //     userId: sender._id,
  //     username: sender.username,
  //     fullName: sender.fullName,
  //     avatarUrl: sender.avatarUrl,
  //   } : null,
  //   type: saved.type,
  //   targetId: saved.targetId.toString(),
  //   message: saved.message,
  //   isRead: saved.isRead,
  //   createdAt: saved.createdAt,
  // };
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

    isRead: saved.isRead,

    createdAt: saved.createdAt!.toISOString(),
  };



  try {
    this.gateway.emitToUser(dto.receiver, 'notification:new', payload);
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
}
