import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
    constructor(private readonly mailerService: MailerService) { }

    async sendMail(to: string, username: string, otp: string) {
        await this.mailerService.sendMail({
            to,
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
