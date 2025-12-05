import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model, Types } from 'mongoose';
import UserResponseDto from './dto/user.response.dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import UpdateUserDto from './dto/update.user.dto';
// import { FriendsService } from '../friends/friends.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        //  private readonly friendsService: FriendsService,
        private readonly eventEmitter: EventEmitter2
    ) { }

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
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException(`Invalid userId: ${userId}`, HttpStatus.BAD_REQUEST);
        }
        
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
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }
        const userIdObject = new Types.ObjectId(userId);


        await this.userModel.findByIdAndUpdate(userIdObject, updateUserDto, { new: true });

        const user = await this.userModel.findById(userIdObject).exec();

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async searchUser(query: string, page: number, limit: number, userId: string) {
        const skip = (page - 1) * limit;
        const qRegex = { $regex: query, $options: 'i' };

        const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId });
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
            friendIds.map(friendId => this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: friendId.toString() }).then(([res]) => res))
        );
        // mutualFriendsArrays bây giờ là 1 mảng 2 chiều: [ [friendA1, friendA2], [friendB1, friendB2], ... ]
        // Gộp tất cả lại
        const mutualFriends = mutualFriendsArrays.flat();
        // Loại bỏ chính user và bạn bè trực tiếp, và loại bỏ duplicate bằng Set
        const mutualIdsSet = new Set<string>();
        mutualFriends.forEach(f => {
            const id = f._id.toString();
            if (id !== userId && !friendIds.some(fid => fid.toString() === id)) {
                mutualIdsSet.add(id);
            }
        });
        const mutualIds = Array.from(mutualIdsSet);

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
        // Sử dụng Set và Map để loại bỏ duplicate dựa trên _id
        const addedUserIds = new Set<string>();
        const combinedResults: UserDocument[] = [];
        
        // Thêm bạn bè trực tiếp (ưu tiên cao nhất)
        for (const user of friendsMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }
        
        // Thêm mutual friends (chỉ nếu chưa có)
        for (const user of mutualMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }
        
        // Thêm người khác (chỉ nếu chưa có)
        for (const user of otherMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }

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

    // ===== EVENT LISTENERS FOR AUTH =====
    @OnEvent(AppEvents.USER_FIND_BY_EMAIL)
    async handleFindByEmail({ email }: { email: string }): Promise<UserDocument | null> {
        return this.findByEmail(email);
    }

    @OnEvent(AppEvents.USER_FIND_BY_USERNAME)
    async handleFindByUsername({ username }: { username: string }): Promise<UserDocument | null> {
        return this.findByUsername(username);
    }

    @OnEvent(AppEvents.USER_CREATE)
    async handleCreate(data: Partial<User>): Promise<UserDocument> {
        return this.create(data);
    }

    @OnEvent(AppEvents.USER_UPDATE)
    async handleUpdate({ userId, updateData }: { userId: string, updateData: UpdateUserDto }): Promise<UserResponseDto> {
        return this.update(userId, updateData);
    }

    @OnEvent(AppEvents.USER_UPDATE_REFRESH_TOKEN)
    async handleUpdateRefreshToken({ userId, refreshToken }: { userId: string, refreshToken: string }): Promise<void> {
        return this.updateRefreshToken(userId, refreshToken);
    }

    @OnEvent(AppEvents.USER_VALIDATE_BY_EMAIL)
    async handleValidateByEmail({ email, password }: { email: string, password: string }): Promise<UserResponseDto | { error: string }> {
        try {
            return await this.validateUserByEmail(email, password);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                return { error: error.message };
            }
            return { error: 'Authentication failed' };
        }
    }

    @OnEvent(AppEvents.USER_FIND_ONE)
    async handleFindOne({ userId }: { userId: string }): Promise<UserResponseDto | { error: string }> {
        try {
            return await this.findOne(userId);
        } catch (error) {
            if (error instanceof HttpException) {
                return { error: error.message };
            }
            return { error: 'User not found' };
        }
    }

    @OnEvent(AppEvents.USER_CHECK_EXISTS)
    async handleCheckUserExists({ userId }: { userId: string }): Promise<boolean> {
        return this.checkUserExist(userId);
    }
}
