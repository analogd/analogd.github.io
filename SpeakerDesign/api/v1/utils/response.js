// Response formatting utilities

const VERSION = '0.1.0';

/**
 * Create successful response with metadata
 */
export function successResponse(data, citations = []) {
    return {
        success: true,
        data,
        meta: {
            version: VERSION,
            units: 'SI',
            citations: citations.length > 0 ? citations : undefined
        }
    };
}

/**
 * Create error response
 */
export function errorResponse(code, message, details = {}) {
    return {
        success: false,
        error: {
            code,
            message,
            details
        }
    };
}
