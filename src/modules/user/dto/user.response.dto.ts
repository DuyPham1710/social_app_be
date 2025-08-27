import { Expose, Transform } from 'class-transformer';

export default class UserResponseDto {
    @Expose()
    @Transform(({ obj }) => obj._id?.toString())
    userId: string;

    @Expose()
    fullName: string;

    @Expose()
    bio?: string;

    @Expose()
    avatarUrl?: string;

    @Expose()
    email: string;

    @Expose()
    username: string;

    @Expose()
    isActive: boolean

    @Expose()
    createdAt: Date;
}
