// Backward-compatible alias: some parts of the codebase expect
// `routes/notification.routes.js`, but the actual implementation
// lives in `routes/notifications.routes.js`.

module.exports = require('./notifications.routes');
