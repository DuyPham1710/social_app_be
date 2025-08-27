import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

        const exceptionResponse = exception.getResponse?.();

        let message = exception.message;

        if (
            typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            (exceptionResponse as any).message
        ) {
            message = (exceptionResponse as any).message;
        }

        response
            .status(status)
            .json({
                statusCode: status,
                // message: exception.message || 'Internal server error',
                message: message,
                timestamp: new Date().toISOString(),
                path: request.url,
            });
    }
}