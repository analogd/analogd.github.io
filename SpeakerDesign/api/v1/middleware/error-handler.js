// Unified error handling middleware

export function errorHandler(err, req, res, next) {
    console.error('API Error:', err);

    // Validation errors (from Foundation)
    if (err.message && err.message.includes('outside valid range')) {
        return res.status(422).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: err.message,
                details: {
                    parameter: extractParameter(err.message)
                }
            }
        });
    }

    // Bad request (missing required fields, etc.)
    if (err.name === 'ValidationError' || err.status === 400) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'BAD_REQUEST',
                message: err.message || 'Invalid request format',
                details: err.details || {}
            }
        });
    }

    // Internal server error
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? {
                message: err.message,
                stack: err.stack
            } : {}
        }
    });
}

function extractParameter(message) {
    // Try to extract parameter name from error message
    // e.g., "Fs=600Hz outside..." → "Fs"
    const match = message.match(/^(\w+)=/);
    return match ? match[1] : 'unknown';
}

// Async route wrapper to catch errors
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
