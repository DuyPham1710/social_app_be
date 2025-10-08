import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt } from "passport-jwt";
import { Strategy } from "passport-jwt";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AppEvents } from "src/shared/enums/app-events.enum";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly configService: ConfigService
    ) {
        super(
            {
                jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
                ignoreExpiration: false,
                secretOrKey: configService.get<string>('JWT_SECRET')!
            }
        );
    }

    async validate(payload: any) {
        const results = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_ONE, {
            userId: payload.sub
        });

        if (!results || results.length === 0) {
            return null;
        }

        const result = results[0];

        // Check if result is an error object
        if (result && typeof result === 'object' && 'error' in result) {
            return null; // For JWT strategy, returning null means authentication failed
        }

        return result;
    }

}