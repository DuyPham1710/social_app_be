import { Injectable, UnauthorizedException, HttpException, HttpStatus } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AppEvents } from "src/shared/enums/app-events.enum";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
    constructor(private readonly eventEmitter: EventEmitter2) {
        super({
            usernameField: 'email',
            passwordField: 'password'
        });
    }

    async validate(email: string, password: string): Promise<UserResponseDto> {
        const results = await this.eventEmitter.emitAsync(AppEvents.USER_VALIDATE_BY_EMAIL, {
            email,
            password
        });

        if (!results || results.length === 0) {
            throw new UnauthorizedException('Authentication failed');
        }

        const result = results[0];

        // Check if result is an error object
        if (result && typeof result === 'object' && 'error' in result) {
            const errorMsg = result.error;
            if (errorMsg.includes('khóa')) {
                throw new HttpException(errorMsg, HttpStatus.FORBIDDEN);
            }
            throw new UnauthorizedException(errorMsg);
        }

        if (!result) {
            throw new UnauthorizedException('Authentication failed');
        }

        return result;
    }

}