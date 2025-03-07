require('dotenv').config();
const express = require('express');
const app = express();
const db = require('./db');
// サーバー起動
app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
  //動作確認
app.get('/', (req, res) => {
    res.send("Hello world");
});

