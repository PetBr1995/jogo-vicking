import fs from 'fs';
import path from 'path';

const srcDir = 'public/assets/base_ready_backup_estavel';
const dstDir = 'public/assets/base_ready';

if (!fs.existsSync(srcDir)) {
  console.error(`Diretório de backup ${srcDir} não encontrado!`);
  process.exit(1);
}

fs.cpSync(srcDir, dstDir, { recursive: true, force: true });
console.log('✅ Rollback executado com sucesso: public/assets/base_ready restaurado para a versão estável!');
