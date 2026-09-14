import 'dotenv/config';
import { app } from './app.js';
import { DEFAULT_HOST, DEFAULT_PORT } from './config/constants.js';

app.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  console.log(`API Luciérnaga ejecutándose en http://localhost:${DEFAULT_PORT}`);
});
