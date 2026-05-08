import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityRequestDocument = CommunityRequest & Document;
@Schema({ timestamps: true, collection: 'community_requests' })
export class CommunityRequest {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
    communityId: Types.ObjectId;

    @Prop({ type: String, enum: ['join', 'invite'], required: true })
    type: string;

    @Prop({ type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
    status: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false, default: null })
    senderId: Types.ObjectId;
}

export const CommunityRequestSchema = SchemaFactory.createForClass(CommunityRequest);
