import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class MailService {
    constructor(
        private readonly mailerService: MailerService,
    ) { }

    @OnEvent(AppEvents.MAIL_SEND)
    async sendMail({ email, username, otp }: { email: string, username: string, otp: string }) {
        await this.mailerService.sendMail({
            to: email,
            subject: 'Active Account',
            text: 'Active Account',
            template: 'mail-template',
            context: {
                username,
                otp,
            },
        });
    }
}
