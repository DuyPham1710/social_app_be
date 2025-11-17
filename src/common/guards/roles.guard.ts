import { CanActivate, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { UserRole } from "src/shared/enums/user_role";
import { ROLES_KEY } from "../decorators/role.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext) {
        const requiredRoles = this.reflector.get<UserRole[]>(
            ROLES_KEY,
            context.getHandler(),
        );
        if (!requiredRoles) return true;

        const { user } = context.switchToHttp().getRequest();

        return requiredRoles.includes(user.role);
    }
}
