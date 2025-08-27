import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { UserService } from "src/modules/user/user.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
    constructor(private readonly userService: UserService) {
        super({
            usernameField: 'email',
            passwordField: 'password'
        });
    }

    async validate(email: string, password: string): Promise<UserResponseDto> {
        const user = await this.userService.validateUserByEmail(email, password);
        return user;
    }

}