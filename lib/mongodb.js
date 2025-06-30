const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const options = {};

let client;
let clientPromise;

if (!process.env.MONGO_URI) {
  throw new Error('Please add your Mongo URI to .env');
}

client = new MongoClient(uri, options);
clientPromise = client.connect();

module.exports = clientPromise;