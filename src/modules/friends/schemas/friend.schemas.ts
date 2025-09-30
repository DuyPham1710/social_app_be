import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true, collection: 'friends' })
export class Friend {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    user_id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    friend_id: Types.ObjectId;
}

export const FriendSchema = SchemaFactory.createForClass(Friend);

// Add indexes for better query performance
FriendSchema.index({ user_id: 1, friend_id: 1 }, { unique: true });
FriendSchema.index({ user_id: 1 });
FriendSchema.index({ friend_id: 1 });
