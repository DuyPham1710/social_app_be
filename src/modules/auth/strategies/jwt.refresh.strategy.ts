import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { ExtractJwt } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor(private readonly configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.get<string>('JWT_SECRET')!,
            passReqToCallback: true
        });
    }

    async validate(req: any, payload: any) {
        const refreshToken = req.headers.authorization.replace('Bearer', '').trim();
        //  console.log('return payload', { ...payload, refreshToken });
        return { ...payload, refreshToken };
    }
}	