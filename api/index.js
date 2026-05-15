const { app } = require('../app');

// Login and health routes work without MongoDB; product routes use requireDatabase.
module.exports = app;
