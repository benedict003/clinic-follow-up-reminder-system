import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// These two lines recreate __dirname functionality inside ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  // Configure your database connection details here
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Replace with your actual password
    // database: 'your_database_name', // Uncomment if your schema.sql doesn't create the database
    multipleStatements: true // Allows running the entire SQL file at once
  });

  try {
    console.log('Reading schema.sql...');
    // Since you are running npm run migrate inside the backend folder,
    // adjust the path to point directly to schema.sql
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running migration...');
    await connection.query(sql);

    console.log('🎉 Migration successfully completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await connection.end();
  }
}

runMigration();
