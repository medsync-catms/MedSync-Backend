const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Default error
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';

    // Database errors
    if (err.code) {
        switch (err.code) {
            case '23505': // unique_violation
                statusCode = 400;
                message = 'Duplicate entry';
                break;
            case '23503': // foreign_key_violation
                statusCode = 400;
                message = 'Referenced record not found';
                break;
            case '23502': // not_null_violation
                statusCode = 400;
                message = 'Required field missing';
                break;
            case '22P02': // invalid_text_representation
                statusCode = 400;
                message = 'Invalid input format';
                break;
        }
    }

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

const notFoundHandler = (req, res) => {
    res.status(404).json({ error: 'Route not found' });
};

module.exports = { errorHandler, notFoundHandler };
