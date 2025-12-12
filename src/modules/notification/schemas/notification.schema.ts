import { Prop, SchemaFactory, Schema } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { NotificationType } from 'src/shared/enums/notification_type';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiver: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  sender: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType })
  type: NotificationType;

  @Prop({ type: Types.ObjectId }) 
  targetId: Types.ObjectId;

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  isRead: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// optional index for fast unread count per user
NotificationSchema.index({ receiver: 1, isRead: 1, createdAt: -1 });

export const NotificationModelName = Notification.name; // 'Notification'
