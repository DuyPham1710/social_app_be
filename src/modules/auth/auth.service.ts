import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import RegisterUserDto from '../user/dto/register.user.dto';
import UserResponseDto from '../user/dto/user.response.dto';
import { generateOtp } from 'src/common/utils/otp.util';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { VerifyAccountDto } from './dto/verify.account';
import UpdateUserDto from '../user/dto/update.user.dto';
import ResetPasswordDto from './dto/reset_password.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    async register(dto: RegisterUserDto): Promise<UserResponseDto> {
        const [existingUser] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_BY_EMAIL, { email: dto.email });
        if (existingUser) {
            throw new BadRequestException('Email is already in use');
        }

        const [existingUsername] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_BY_USERNAME, { username: dto.username });
        if (existingUsername) {
            throw new BadRequestException('Username is already taken');
        }

        // generate otp and send to email
        const otp: string = generateOtp(6);

        //  console.log(`>>> check otp: ${otp}`);
        await this.eventEmitter.emitAsync(AppEvents.MAIL_SEND, {
            email: dto.email,
            username: dto.username,
            otp: otp
        });

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        const [user] = await this.eventEmitter.emitAsync(AppEvents.USER_CREATE, {
            ...dto,
            password: hashedPassword,
            otp,
            otpGeneratedTime: new Date(),
        });

        return plainToInstance(UserResponseDto, user.toObject(), {
            excludeExtraneousValues: true,
        });
    }

    async login(user: UserResponseDto) {
        const payload = { email: user.email, sub: user.userId };
        const refreshToken = this.jwtService.sign(payload, { expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRE });

        await this.eventEmitter.emitAsync(AppEvents.USER_UPDATE_REFRESH_TOKEN, {
            userId: user.userId,
            refreshToken
        });
        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: refreshToken,
            user: user
        };
    }

    async verifyAccount(verifyAccountDto: VerifyAccountDto): Promise<UserResponseDto> {
        const [user] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_BY_EMAIL, {
            email: verifyAccountDto.email
        });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const otpExpirationTime = 1 * 60 * 1000; // 1 phút = 60.000 ms
        const otpValidUntil = new Date(Date.now() - otpExpirationTime);

        if (user.otp === verifyAccountDto.otp && user.otpGeneratedTime && user.otpGeneratedTime > otpValidUntil) {
            user.isActive = true;
            const [result] = await this.eventEmitter.emitAsync(AppEvents.USER_UPDATE, {
                userId: user._id.toString(),
                updateData: user
            });
            return result;
        }
        throw new UnauthorizedException('OTP is invalid or has expired. Please regenerate a new OTP and try again.');
    }

    async resendOtp(email: string) {
        const [user] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_BY_EMAIL, { email });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const otp: string = generateOtp(6);

        await this.eventEmitter.emitAsync(AppEvents.MAIL_SEND, {
            email: email,
            username: user.username,
            otp: otp
        });

        const updateUser: UpdateUserDto = {
            otp: otp,
            otpGeneratedTime: new Date()
        }

        await this.eventEmitter.emitAsync(AppEvents.USER_UPDATE, {
            userId: user._id.toString(),
            updateData: updateUser
        });

        return {
            message: 'A new OTP has been sent to your email. Please check your inbox and verify account within 1 minute.'
        };
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto) {
        const [user] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_BY_EMAIL, {
            email: resetPasswordDto.email
        });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // verify otp
        if (user.otp !== resetPasswordDto.otp) {
            throw new UnauthorizedException('OTP is invalid or has expired. Please regenerate a new OTP and try again.');
        }

        if (resetPasswordDto.newPassword === resetPasswordDto.confirmNewPassword) {
            const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);
            const [updatedUser] = await this.eventEmitter.emitAsync(AppEvents.USER_UPDATE, {
                userId: user._id.toString(),
                updateData: { password: hashedPassword }
            });
            return plainToInstance(UserResponseDto, updatedUser, {
                excludeExtraneousValues: true
            });
        }
        throw new BadRequestException('Password and confirm password do not match. Please try again!');
    }
}
