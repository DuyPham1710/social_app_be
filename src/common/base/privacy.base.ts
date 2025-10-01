import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export class PrivacyBase {
    @Prop({
        type: String,
        enum: PrivacyType,
        default: PrivacyType.PUBLIC,
    })
    privacy_type: PrivacyType;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
    friends_except?: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
    friends_detail?: Types.ObjectId[];
}
