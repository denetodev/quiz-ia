const fs = require('fs');

const url = process.env['SUPABASE_URL'];
const key = process.env['SUPABASE_KEY'];

if (!url || !key) {
  console.error('ERRO: SUPABASE_URL ou SUPABASE_KEY não estão definidas no ambiente.');
  process.exit(1);
}

const envContent = `export const environment = {
  production: true,
  supabaseUrl: '${url}',
  supabaseKey: '${key}'
};
`;

fs.writeFileSync('./src/environments/environment.ts', envContent);
console.log('environment.ts gerado com sucesso a partir das variáveis de ambiente.');