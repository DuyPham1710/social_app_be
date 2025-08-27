import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true }) // tự động tạo createdAt, updatedAt
export class User {
    @Prop({ type: String, required: true })
    fullName: string;

    @Prop({ type: String })
    bio: string;

    @Prop({ type: String })
    avatarUrl: string;

    @Prop({ type: String, required: true, unique: true })
    email: string;

    @Prop({ type: String, required: true, unique: true })
    username: string;

    @Prop({ type: String, required: true })
    password: string;

    @Prop({ type: Boolean, default: false })
    isActive: boolean;

    @Prop({ type: String })
    otp?: string;

    @Prop({ type: Date })
    otpGeneratedTime?: Date;

    @Prop({ type: String })
    refreshToken?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
