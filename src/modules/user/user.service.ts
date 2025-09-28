import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model } from 'mongoose';
import UserResponseDto from './dto/user.response.dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import UpdateUserDto from './dto/update.user.dto';

@Injectable()
export class UserService {
    constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) { }

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
}
