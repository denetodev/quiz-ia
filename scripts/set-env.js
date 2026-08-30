const fs = require('fs');

const envContent = `export const environment = {
  production: true,
  supabaseUrl: '${process.env['SUPABASE_URL']}',
  supabaseKey: '${process.env['SUPABASE_KEY']}'
};
`;

fs.writeFileSync('./src/environments/environment.ts', envContent);
console.log('environment.ts gerado com sucesso a partir das variáveis de ambiente.');
