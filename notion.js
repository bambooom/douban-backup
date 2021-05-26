require('dotenv').config();
const {Client, LogLevel} = require("@notionhq/client");

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

// example: https://github.com/makenotion/notion-sdk-js/blob/main/examples/database-update-send-email/index.js
