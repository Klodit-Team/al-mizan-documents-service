const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'amq.topic';
const KEYS = [
  'documentation.organisation.documents.uploaded',
  'documentation.organisation.documents.failed',
];

const DB_FILE = path.resolve(__dirname, '../tmp/users-mock-db.json');

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

(async () => {
  console.log('Connecting to', RABBIT_URL);
  const conn = await amqp.connect(RABBIT_URL);
  const ch = await conn.createChannel();

  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  const q = await ch.assertQueue('users.mock.consumer', { durable: true });

  for (const key of KEYS) {
    await ch.bindQueue(q.queue, EXCHANGE, key);
    console.log('Bound queue to', key);
  }

  ch.consume(
    q.queue,
    async (msg) => {
      if (!msg) return;
      let body = null;
      try {
        body = JSON.parse(msg.content.toString());
      } catch (e) {
        console.error('Invalid JSON payload', msg.content.toString());
        ch.ack(msg);
        return;
      }

      console.log('--- users-mock-service received ---');
      console.log('routingKey=', msg.fields.routingKey);
      console.log(JSON.stringify(body, null, 2));

      // Simulate upsert by organisation_id + document type
      try {
        const db = loadDb();
        const org = body.organisation_id || 'unknown';
        db[org] = db[org] || { uploaded: [], failed: [] };

        if (body.status === 'success' && Array.isArray(body.uploaded_documents)) {
          for (const d of body.uploaded_documents) {
            db[org].uploaded = db[org].uploaded.filter((x) => x.type !== d.type);
            db[org].uploaded.push({
              type: d.type,
              document_id: d.document_id || null,
              storage_key: d.storage_key || null,
              file_name: d.file_name || null,
              received_at: new Date().toISOString(),
            });
          }
        }

        if (body.status === 'failed' && Array.isArray(body.failed_documents)) {
          for (const f of body.failed_documents) {
            db[org].failed.push({
              type: f.type,
              file_name: f.file_name || null,
              reason: f.reason || null,
              received_at: new Date().toISOString(),
            });
          }
        }

        saveDb(db);
        console.log('Upsert simulated in', DB_FILE);
      } catch (e) {
        console.error('Error simulating upsert', e.message);
      }

      // Simulate users-service ack behavior: acknowledge the message
      ch.ack(msg);
    },
    { noAck: false },
  );

  process.on('SIGINT', async () => {
    await ch.close();
    await conn.close();
    process.exit(0);
  });

  console.log('users-mock-service is listening for organisation document events...');
})();
