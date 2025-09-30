import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model, Types } from 'mongoose';
import UserResponseDto from './dto/user.response.dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import UpdateUserDto from './dto/update.user.dto';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class UserService {
    constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>, private readonly friendsService: FriendsService) { }

    async findAll(): Promise<UserResponseDto[]> {
        const users = await this.userModel.find().exec();
        return plainToInstance(UserResponseDto, users, {
            excludeExtraneousValues: true
        });
    }

    async findByEmail(email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).exec();
    }

    async findByUsername(username: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ username }).exec();
    }

    async findOne(userId: string): Promise<UserResponseDto> {
        const user = await this.userModel.findById(userId).exec();

        if (!user) {
            throw new HttpException(`User with ID ${userId} not found`, HttpStatus.NOT_FOUND);
        }
        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async checkUserExist(userId: string): Promise<boolean> {
        const user = await this.userModel.exists({ _id: userId }).exec();
        return !!user;
    }

    async create(data: Partial<User>): Promise<UserDocument> {
        const newUser = new this.userModel(data);
        return newUser.save();
    }

    async validateUserByEmail(email: string, password: string): Promise<UserResponseDto> {
        const user = await this.findByEmail(email);

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const auth = await bcrypt.compare(password, user.password);

        if (!auth) {
            throw new UnauthorizedException('Invalid password');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Your account is not activated. Please verify your email to activate your account');
        }

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async updateRefreshToken(userId: string, refreshToken: string) {
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await this.userModel.findByIdAndUpdate(
            userId,
            { refreshToken: hashedRefreshToken },
            { new: true } // trả về user đã cập nhật 
        );
    }

    async update(userId: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        await this.userModel.findByIdAndUpdate(userId, updateUserDto, { new: true });

        const user = await this.userModel.findById(userId).exec();

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async searchUser(query: string, page: number, limit: number, userId: string) {
        const skip = (page - 1) * limit;
        const qRegex = { $regex: query, $options: 'i' };

        const friends = await this.friendsService.getFriends(userId);
        const friendIds = friends.map(friend => friend._id);

        // Tìm bạn bè trực tiếp phù hợp query
        const friendsMatched = await this.userModel.find({
            _id: { $in: friendIds },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Tìm mutual friends (friends-of-friends) match query
        const mutualFriendsArrays = await Promise.all(
            friendIds.map(friendId => this.friendsService.getFriends(friendId.toString()))
        );
        // mutualFriendsArrays bây giờ là 1 mảng 2 chiều: [ [friendA1, friendA2], [friendB1, friendB2], ... ]
        // Gộp tất cả lại
        const mutualFriends = mutualFriendsArrays.flat();
        // Loại bỏ chính user và bạn bè trực tiếp (tránh trùng)
        const mutualIds = mutualFriends
            .map(f => f._id.toString())
            .filter(id => id !== userId && !friendIds.includes(new Types.ObjectId(id)));

        // Tìm mutual friends phù hợp query
        const mutualMatched = await this.userModel.find({
            _id: { $in: mutualIds },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Tìm tất cả user khác phù hợp query (ngoại trừ chính mình và bạn bè đã có)
        const otherMatched = await this.userModel.find({
            _id: { $nin: [userId, ...friendIds, ...mutualIds] },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Gộp lại theo thứ tự ưu tiên: bạn bè → mutual → người khác
        let combinedResults = [
            ...friendsMatched,
            ...mutualMatched,
            ...otherMatched,
        ];

        const totalItems = combinedResults.length;
        const totalPages = Math.ceil(totalItems / limit);
        const paginated = combinedResults.slice(skip, skip + limit);

        const userResponseDtos: UserResponseDto[] = paginated.map(user => plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        }));

        return {
            userResponseDtos,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        };
    }
}
