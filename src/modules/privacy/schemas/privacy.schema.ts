import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export type PrivacyDocument = Privacy & Document;

@Schema({ timestamps: true })
export class Privacy {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    // Mặc định khi user tạo post mới
    @Prop({
        type: String,
        enum: PrivacyType,
        default: PrivacyType.PUBLIC,
    })
    defaultPrivacy: PrivacyType;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    friends_except?: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    friends_detail?: Types.ObjectId[];
}

export const PrivacySchema = SchemaFactory.createForClass(Privacy);
