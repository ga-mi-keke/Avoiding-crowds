require('dotenv').config();
const mysql = require('mysql2');
//データベース接続設定
const connection = mysql.createConnection({
//接続情報は各自ローカルの.envファイルを参照(.envは各自で作成)
  host: process.env.DB_HOST,  
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});
connection.connect(err => {
  if (err) {
    console.error('データベースへの接続に失敗しました:', err);
  } else {
    console.log('データベースへの接続に成功しました');
  }
});
//serverにエクスポート
module.exports = connection;