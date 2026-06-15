export function isMongoDuplicateKeyError(error: any): boolean {
    if (!error) {
        return false;
    }

    if (error.code === 11000) {
        return true;
    }

    if (Array.isArray(error.writeErrors)) {
        return error.writeErrors.every((writeError) => writeError?.code === 11000);
    }

    return false;
}
