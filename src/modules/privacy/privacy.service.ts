import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { OnEvent } from '@nestjs/event-emitter';
import { Privacy, PrivacyDocument } from './schemas/privacy.schema';
// import { PrivacyResponseDto } from './dto/privacy-response.dto';
import { DefaultPrivacyResponseDto } from './dto/default-privacy-response.dto';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class PrivacyService {
    constructor(
        @InjectModel(Privacy.name) private privacyModel: Model<PrivacyDocument>,
    ) { }

    // async getPrivacy(userId: string): Promise<PrivacyResponseDto> {
    //     if (!Types.ObjectId.isValid(userId)) {
    //         throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    //     }

    //     const userObjectId = new Types.ObjectId(userId);

    //     const privacy = await this.privacyModel
    //         .findOne({ userId: userObjectId })
    //         .populate('friends_except', 'fullName username avatarUrl _id')
    //         .populate('friends_detail', 'fullName username avatarUrl _id')
    //         .lean()
    //         .exec();

    //     if (!privacy) {
    //         // Nếu không tìm thấy privacy, trả về default
    //         const defaultPrivacy: PrivacyResponseDto = {
    //             userId: userObjectId.toString(),
    //             defaultPrivacy: PrivacyType.PUBLIC,
    //             friends_except: [],
    //             friends_detail: [],
    //         };
    //         return plainToInstance(PrivacyResponseDto, defaultPrivacy, {
    //             excludeExtraneousValues: true,
    //         });
    //     }

    //     // Transform friends arrays using UserResponseDto
    //     const friendsExcept = Array.isArray(privacy.friends_except)
    //         ? privacy.friends_except.map((friend: any) =>
    //             plainToInstance(UserResponseDto, friend, {
    //                 excludeExtraneousValues: true,
    //             }),
    //         )
    //         : [];

    //     const friendsDetail = Array.isArray(privacy.friends_detail)
    //         ? privacy.friends_detail.map((friend: any) =>
    //             plainToInstance(UserResponseDto, friend, {
    //                 excludeExtraneousValues: true,
    //             }),
    //         )
    //         : [];

    //     const privacyData = {
    //         ...privacy,
    //         userId: privacy.userId?.toString() || userObjectId.toString(),
    //         friends_except: friendsExcept,
    //         friends_detail: friendsDetail,
    //     };

    //     return plainToInstance(PrivacyResponseDto, privacyData, {
    //         excludeExtraneousValues: true,
    //     });
    // }

    async getDefaultPrivacy(userId: string): Promise<DefaultPrivacyResponseDto> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const userObjectId = new Types.ObjectId(userId);

        const privacy = await this.privacyModel
            .findOne({ userId: userObjectId })
            .select('defaultPrivacy friends_except friends_detail')
            .populate('friends_except', 'fullName username avatarUrl _id')
            .populate('friends_detail', 'fullName username avatarUrl _id')
            .lean()
            .exec();

        if (!privacy) {
            const defaultPrivacy: DefaultPrivacyResponseDto = {
                defaultPrivacy: PrivacyType.PUBLIC,
                friends_except: [],
                friends_detail: [],
            };
            return plainToInstance(DefaultPrivacyResponseDto, defaultPrivacy, {
                excludeExtraneousValues: true,
            });
        }

        const friendsExcept = Array.isArray(privacy.friends_except)
            ? privacy.friends_except.map((friend: any) => {
                return plainToInstance(UserResponseDto, friend, {
                    excludeExtraneousValues: true,
                });
            })
            : [];
        console.log(friendsExcept);
        const friendsDetail = Array.isArray(privacy.friends_detail)
            ? privacy.friends_detail.map((friend: any) => {
                return plainToInstance(UserResponseDto, friend, {
                    excludeExtraneousValues: true,
                });
            })
            : [];

        const privacyData: DefaultPrivacyResponseDto = {
            defaultPrivacy: privacy.defaultPrivacy || PrivacyType.PUBLIC,
            friends_except: friendsExcept || [],
            friends_detail: friendsDetail || [],
        };
        return privacyData;
    }

    async updateDefaultPrivacy(
        userId: string,
        defaultPrivacy: PrivacyType,
        friendsExcept?: string[],
        friendsDetail?: string[],
    ): Promise<DefaultPrivacyResponseDto> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        // Validate: nếu chọn FRIENDS_EXCEPT thì phải có friends_except
        if (defaultPrivacy === PrivacyType.FRIENDS_EXCEPT) {
            if (!friendsExcept || friendsExcept.length === 0) {
                throw new HttpException(
                    'friends_except is required when defaultPrivacy is friends_except',
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        // Validate: nếu chọn FRIENDS_DETAIL thì phải có friends_detail
        if (defaultPrivacy === PrivacyType.FRIENDS_DETAIL) {
            if (!friendsDetail || friendsDetail.length === 0) {
                throw new HttpException(
                    'friends_detail is required when defaultPrivacy is friends_detail',
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        const userObjectId = new Types.ObjectId(userId);

        // Validate friend IDs
        const friendIdsToValidate = [
            ...(friendsExcept || []),
            ...(friendsDetail || []),
        ];

        for (const friendId of friendIdsToValidate) {
            if (!Types.ObjectId.isValid(friendId)) {
                throw new HttpException(`Invalid friend ID: ${friendId}`, HttpStatus.BAD_REQUEST);
            }
        }

        // Convert string array to ObjectId array
        const friendsExceptObjectIds = friendsExcept
            ? friendsExcept.map((id) => new Types.ObjectId(id))
            : [];
        const friendsDetailObjectIds = friendsDetail
            ? friendsDetail.map((id) => new Types.ObjectId(id))
            : [];

        // Tìm hoặc tạo privacy cho user
        let privacy = await this.privacyModel.findOne({ userId: userObjectId }).exec();

        if (!privacy) {
            // Nếu chưa có privacy, tạo mới
            privacy = new this.privacyModel({
                userId: userObjectId,
                defaultPrivacy: defaultPrivacy,
                friends_except: friendsExceptObjectIds,
                friends_detail: friendsDetailObjectIds,
            });
            await privacy.save();
        } else {
            // Cập nhật defaultPrivacy và friends lists
            privacy.defaultPrivacy = defaultPrivacy;

            // Chỉ cập nhật friends_except nếu defaultPrivacy là FRIENDS_EXCEPT
            if (defaultPrivacy === PrivacyType.FRIENDS_EXCEPT) {
                privacy.friends_except = friendsExceptObjectIds;
            }
            // Chỉ cập nhật friends_detail nếu defaultPrivacy là FRIENDS_DETAIL
            else if (defaultPrivacy === PrivacyType.FRIENDS_DETAIL) {
                privacy.friends_detail = friendsDetailObjectIds;
            }

            await privacy.save();
        }

        return await this.getDefaultPrivacy(userId);

    }

    // ===== EVENT LISTENERS =====
    @OnEvent(AppEvents.USER_CREATED)
    async handleUserCreated({ userId }: { userId: string }): Promise<void> {
        if (!Types.ObjectId.isValid(userId)) {
            return;
        }

        const userObjectId = new Types.ObjectId(userId);

        // Kiểm tra xem user đã có privacy chưa
        const existingPrivacy = await this.privacyModel.findOne({ userId: userObjectId }).exec();
        if (existingPrivacy) {
            return; // Đã có privacy rồi, không cần tạo mới
        }

        // Tạo privacy mặc định với defaultPrivacy = PUBLIC
        const defaultPrivacy = new this.privacyModel({
            userId: userObjectId,
            defaultPrivacy: PrivacyType.PUBLIC,
            friends_except: [],
            friends_detail: [],
        });

        await defaultPrivacy.save();
    }
}
