import { Injectable } from "@nestjs/common";
import { UserRole } from "src/shared/enums/user_role";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument } from "./schemas/user.schema";
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminInitializerService {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>
    ) { }

    async onModuleInit() {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        const admin = await this.userModel.findOne({ role: UserRole.ADMIN });

        if (!admin) {
            console.log('No admin found -> creating default admin...');

            await this.userModel.create({
                fullName: 'Administrator',
                email: adminEmail,
                username: 'admin',
                password: await bcrypt.hash(adminPassword, 10),
                role: UserRole.ADMIN,
                isActive: true,
            });
            console.log('Admin account created');
        } else {
            console.log('Admin already exists');
        }
    }
}
