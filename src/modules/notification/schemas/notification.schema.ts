import { Prop, SchemaFactory, Schema } from "@nestjs/mongoose";
import {  Types } from "mongoose";
import {NotificationType} from 'src/shared/enums/notification_type'

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    receiver: Types.ObjectId; // người nhận thông báo

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    sender: Types.ObjectId; // người gây ra sự kiện

    @Prop({ type: String, enum: NotificationType })
    type: NotificationType;

    @Prop({ type: Types.ObjectId }) 
    targetId: Types.ObjectId;     // id bài viết hoặc id user

    @Prop({ required: true })
    message: string;

    @Prop({ default: false })
    isRead: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
