import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityMemberDocument = CommunityMember & Document;
@Schema({ timestamps: true, collection: 'community_members' })
export class CommunityMember {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
    communityId: Types.ObjectId;

    @Prop({ type: String, enum: ['member', 'admin'], default: 'member' })
    role: string;

}

export const CommunityMemberSchema = SchemaFactory.createForClass(CommunityMember);