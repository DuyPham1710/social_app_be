import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { MediaType } from 'src/shared/enums/media_type';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { DeezerMusic } from 'src/shared/interfaces/deezer-music.interface';

export type StoryDocument = Story & Document;

@Schema({ timestamps: true }) // createdAt, updatedAt
export class Story extends PrivacyBase {
    _id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: String })
    title?: string;

    @Prop({ type: String })
    mediaUrl?: string;

    @Prop({ enum: MediaType, default: MediaType.TEXT })
    mediaType: MediaType;

    @Prop({ type: Object })
    music?: DeezerMusic;

    // Thời gian hết hạn (mặc định 24h kể từ createdAt)
    @Prop({ type: Date, default: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    expireAt: Date;

    // Lưu trữ story để xem lại 
    @Prop({ type: Boolean, default: false })
    isArchived: boolean;

    @Prop({ type: Date })
    archivedAt?: Date;
}

export const StorySchema = SchemaFactory.createForClass(Story);
