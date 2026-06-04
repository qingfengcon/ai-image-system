require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'ai-image-system-secret-key-2024',
  WAVESPEED_API_KEY: process.env.WAVESPEED_API_KEY || '',
  WAVESPEED_BASE_URL: 'https://api.wavespeed.ai/api/v3',
  DB_PATH: process.env.DB_PATH || './data/database.sqlite',
  UPLOAD_DIR: './uploads',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin123'
};
