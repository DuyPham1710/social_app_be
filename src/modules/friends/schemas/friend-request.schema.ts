import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendRequestDocument = FriendRequest & Document;

@Schema({ timestamps: true, collection: 'friendrequests' })
export class FriendRequest {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    sender_id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    receiver_id: Types.ObjectId;

}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

// Add indexes for better query performance
FriendRequestSchema.index({ sender_id: 1, receiver_id: 1, status: 1 }, { unique: true });
FriendRequestSchema.index({ receiver_id: 1, status: 1 });
FriendRequestSchema.index({ sender_id: 1, status: 1 });

