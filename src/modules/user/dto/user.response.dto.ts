import { Expose, Transform } from 'class-transformer';

export default class UserResponseDto {
    @Expose()
    @Transform(({ obj }) => obj._id?.toString())
    userId: string;

    @Expose()
    fullName: string;

    @Expose()
    phoneNumber?: string;

    @Expose()
    bio?: string;

    @Expose()
    avatarUrl?: string;

    @Expose()
    dateOfBirth?: string;

    @Expose()
    gender?: string;

    @Expose()
    coverUrl?: string;

    @Expose()
    school?: string;

    @Expose()
    currentCity?: string;

    @Expose()
    hometown?: string;

    @Expose()
    workplace?: string;

    @Expose()
    relationshipStatus?: string;

    @Expose()
    email?: string;

    @Expose()
    username?: string;

    @Expose()
    isActive?: boolean;

    @Expose()
    isBan?: boolean;

    @Expose()
    createdAt?: Date;

    @Expose()
    role?: string;

    @Expose()
    fcmToken?: string;

    @Expose()
    isOnline?: boolean;

    @Expose()
    lastSeenAt?: Date;

    @Expose()
    isFaceRegistered?: boolean;
}
