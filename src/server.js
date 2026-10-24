import { app } from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`===============================================`);
  console.log(`🚀 AKM SFTP Manager is running on:`);
  console.log(`   http://localhost:${config.port}`);
  console.log(`===============================================`);
});
