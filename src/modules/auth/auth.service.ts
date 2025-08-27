import { BadRequestException, Injectable } from '@nestjs/common';
import RegisterUserDto from '../user/dto/register.user.dto';
import UserResponseDto from '../user/dto/user.response.dto';
import { UserService } from '../user/user.service';
import { generateOtp } from 'src/common/utils/otp.util';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';

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
        await this.mailService.sendMail(dto.email, dto.fullName, otp);

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
            refreshToken: refreshToken
        };
    }

}
