import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export const validationPipe = new ValidationPipe({
    transform: true,
    exceptionFactory: (validationErrors: ValidationError[] = []) => {
        return new BadRequestException(
            validationErrors.map((error) => ({
                [error.property]: error.constraints
                    ? Object.values(error.constraints)[0]
                    : 'Validation failed',
            })),
        );
    },
});
