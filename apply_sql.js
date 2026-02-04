const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres:odnQL15sIDUN5dbt@db.lezdnplqsgyehfrkpmlx.supabase.co:5432/postgres';

async function applySql() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });
    try {
        console.log('Connecting...');
        await client.connect();
        console.log('Connected!');

        const sql = fs.readFileSync('new_features_setup.sql', 'utf8');
        console.log('Executing SQL...');
        await client.query(sql);
        console.log('SUCCESS');

    } catch (err) {
        console.log('FAILURE: ' + err.message);
    } finally {
        await client.end();
        process.exit();
    }
}

applySql();
