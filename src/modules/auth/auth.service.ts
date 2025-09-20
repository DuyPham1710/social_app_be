import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import RegisterUserDto from '../user/dto/register.user.dto';
import UserResponseDto from '../user/dto/user.response.dto';
import { UserService } from '../user/user.service';
import { generateOtp } from 'src/common/utils/otp.util';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { VerifyAccountDto } from './dto/verify.account';
import UpdateUserDto from '../user/dto/update.user.dto';
import ResetPasswordDto from './dto/reset_password.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService
    ) { }

    async register(dto: RegisterUserDto): Promise<UserResponseDto> {
        if (await this.userService.findByEmail(dto.email)) {
            throw new BadRequestException('Email is already in use');
        }

        if (await this.userService.findByUsername(dto.username)) {
            throw new BadRequestException('Username is already taken');
        }

        // generate otp and send to email
        const otp: string = generateOtp(6);

        //  console.log(`>>> check otp: ${otp}`);
        await this.mailService.sendMail(dto.email, dto.username, otp);

        const hashedPassword = await bcrypt.hash(dto.password, 10);


        const user = await this.userService.create({
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

        await this.userService.updateRefreshToken(user.userId, refreshToken);
        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: refreshToken,
            user: user
        };
    }

    async verifyAccount(verifyAccountDto: VerifyAccountDto): Promise<UserResponseDto> {
        const user = await this.userService.findByEmail(verifyAccountDto.email);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const otpExpirationTime = 1 * 60 * 1000; // 1 phút = 60.000 ms
        const otpValidUntil = new Date(Date.now() - otpExpirationTime);

        if (user.otp === verifyAccountDto.otp && user.otpGeneratedTime && user.otpGeneratedTime > otpValidUntil) {
            user.isActive = true;
            await this.userService.update(user.id.toString(), user);

            return plainToInstance(UserResponseDto, user, {
                excludeExtraneousValues: true
            });
        }
        throw new UnauthorizedException('OTP is invalid or has expired. Please regenerate a new OTP and try again.');
    }

    async resendOtp(email: string) {
        const user = await this.userService.findByEmail(email);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const otp: string = generateOtp(6);

        await this.mailService.sendMail(email, user.username, otp);

        const updateUser: UpdateUserDto = {
            otp: otp,
            otpGeneratedTime: new Date()
        }

        await this.userService.update(user.id.toString(), updateUser);

        return {
            message: 'A new OTP has been sent to your email. Please check your inbox and verify account within 1 minute.'
        };
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto) {
        const user = await this.userService.findByEmail(resetPasswordDto.email);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // verify otp
        if (user.otp !== resetPasswordDto.otp) {
            throw new UnauthorizedException('OTP is invalid or has expired. Please regenerate a new OTP and try again.');
        }

        if (resetPasswordDto.newPassword === resetPasswordDto.confirmNewPassword) {
            user.password = await bcrypt.hash(resetPasswordDto.newPassword, 10);
            await this.userService.update(user.id.toString(), user);
            return plainToInstance(UserResponseDto, user, {
                excludeExtraneousValues: true
            });
        }
        throw new BadRequestException('Password and confirm password do not match. Please try again!');
    }
}
