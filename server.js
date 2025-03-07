require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const db = require('./db');
const path = require('path');

app.use(cors());
app.use(bodyParser.json());

// 登録API（新規ユーザー作成）
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // パスワードをハッシュ化
  const hashedPassword = await bcrypt.hash(password, 10);

  // DBにユーザー登録
  db.query(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username, hashedPassword],
    (err, result) => {
      if (err) {
        return res.status(500).send('ユーザー登録に失敗しました');
      }
      res.status(201).send('ユーザー登録が完了しました');
    }
  );
});

// ログインAPI（認証）
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(401).send('ユーザー名またはパスワードが間違っています');
      }

      const user = results[0];

      // パスワード比較
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).send('ユーザー名またはパスワードが間違っています');
      }

      // JWTトークン生成
      const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.json({ message: 'ログイン成功', token });
    }
  );
});

// 認証必須のテスト用API
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).send('認証トークンがありません');

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send('トークンが無効です');
    req.user = user;
    next();
  });
};

app.get('/protected', authenticateToken, (req, res) => {
  res.send(`認証されたユーザーです: ${req.user.username}`);
});
// Reactのビルドフォルダを静的ファイルとして配信
app.use(express.static(path.join(__dirname, 'build')));

// API以外のリクエストはReactのindex.htmlを返す（React Router用）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// サーバー起動
app.listen(3000, () => {
  console.log('Server running on port 3000');
});


