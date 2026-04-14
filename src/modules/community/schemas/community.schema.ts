import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommunityPrivacy } from 'src/shared/enums/community_privacy';

export type CommunityDocument = Community & Document;

@Schema({ timestamps: true, collection: 'communities' })
export class Community {
    @Prop({ type: String, required: true })
    name: string;

    // Admin của cộng đồng
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    adminId: Types.ObjectId;

    // Ảnh đại diện cộng đồng
    @Prop({ type: String, default: 'https://res.cloudinary.com/dk7ypst5k/image/upload/v1766304547/avt_bnegko.jpg' })
    avatar: string;

    // Ảnh bìa cộng đồng
    @Prop({ type: String, default: 'https://res.cloudinary.com/dk7ypst5k/image/upload/v1744336768/samples/balloons.jpg' })
    coverImage: string;

    // Mô tả cộng đồng
    @Prop({ type: String, default: '' })
    description: string;

    // Loại cộng đồng: public (ai cũng thấy) | private (phải được duyệt)
    @Prop({ type: String, enum: CommunityPrivacy, default: CommunityPrivacy.PUBLIC })
    privacy: CommunityPrivacy;

    // Số lượng thành viên (cached)
    @Prop({ type: Number, default: 0 })
    memberCount: number;
}

export const CommunitySchema = SchemaFactory.createForClass(Community);

CommunitySchema.index({ adminId: 1 });
CommunitySchema.index({ privacy: 1 });

export { CommunityPrivacy };

