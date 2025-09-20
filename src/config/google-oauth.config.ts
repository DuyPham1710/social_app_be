import { ConfigModule, ConfigService, registerAs } from "@nestjs/config";

export default registerAs('google', () => ({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
        clientId: config.get<string>('GOOGLE_CLIENT_ID'),
        clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
        callbackURL: config.get<string>('GOOGLE_CALLBACK_URL'),
    }),
}));