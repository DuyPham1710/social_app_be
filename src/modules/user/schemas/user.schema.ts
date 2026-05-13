import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from 'src/shared/enums/user_role';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' }) // tự động tạo createdAt, updatedAt
export class User {
    @Prop({ type: String })
    fullName: string;

    @Prop({ type: String })
    phoneNumber: string;

    @Prop({ type: String })
    bio: string;

    @Prop({ type: String })
    avatarUrl: string;

    @Prop({ type: String })
    dateOfBirth: string;

    @Prop({ type: String })
    gender: string;

    @Prop({ type: String })
    coverUrl: string;

    @Prop({ type: String })
    school: string;

    @Prop({ type: String })
    currentCity: string;

    @Prop({ type: String })
    hometown: string;

    @Prop({ type: String })
    workplace: string;

    @Prop({ type: String })
    relationshipStatus: string;

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

    // FCM token for push notifications
    @Prop({ type: String, default: '' })
    fcmToken: string;

    // role of user
    @Prop({ type: String, enum: UserRole, default: UserRole.USER })
    role: UserRole;

    // Presence (chat/friend online status)
    @Prop({ type: Boolean, default: false, index: true })
    isOnline?: boolean;

    // Face Registration Status
    @Prop({ type: Boolean, default: false })
    isFaceRegistered: boolean;

    // Timestamp when user last went offline (disconnect with no remaining sockets)
    @Prop({ type: Date })
    lastSeenAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
