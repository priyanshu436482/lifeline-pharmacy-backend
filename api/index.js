const { app, initializeDatabase } = require('../app');

module.exports = async (req, res) => {
  try {
    await initializeDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Vercel handler failed:', error);
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }
};
