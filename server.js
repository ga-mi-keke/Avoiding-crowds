//サーバー(内部的な処理するとこ)
//↓必要な奴読み込んでる
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const db = require('./db');
const path = require('path');
//?なんかいるらしい
app.use(cors());
//JSONデータを扱うためのやつ
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

// authenticateToken ミドルウェア
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証トークンがありません' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '無効なトークンです' });
    req.user = user; // user オブジェクトには user.id やメールアドレスなどが含まれている前提
    next();
  });
};

// POST /inquiries エンドポイント（企業様向け問い合わせ登録）
app.post('/inquiries', (req, res) => {
  const { email, company_name, company_description, technology1, technology2, technology3, technology4, technology5 } = req.body;
  
  // 必須項目チェック
  if (!email || !company_name || !company_description) {
    return res.status(400).json({ error: 'Eメール、企業名、企業内容説明は必須です' });
  }
  
  const createdAt = new Date();
  const sql = `
    INSERT INTO company_inquiries 
    (email, company_name, company_description, technology1, technology2, technology3, technology4, technology5, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    email,
    company_name,
    company_description,
    technology1 || null,
    technology2 || null,
    technology3 || null,
    technology4 || null,
    technology5 || null,
    createdAt
  ];
  
  db.query(sql, params, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '問い合わせの登録に失敗しました' });
    }
    res.status(201).json({ message: '問い合わせが登録されました', id: result.insertId });
  });
});
// 使用技術一覧取得エンドポイント
app.get('/inquiries/technologies', (req, res) => {
  const sql = 'SELECT technology1, technology2, technology3, technology4, technology5 FROM company_inquiries';
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '使用技術の取得に失敗しました' });
    }
    const techSet = new Set();
    results.forEach(row => {
      [row.technology1, row.technology2, row.technology3, row.technology4, row.technology5].forEach(tech => {
        if (tech && tech.trim() !== '') {
          techSet.add(tech.trim());
        }
      });
    });
    res.json(Array.from(techSet));
  });
});
//絞り込みやってる(らしい）)
app.get('/inquiries', (req, res) => {
  const { technologies } = req.query;
  
  let sql = 'SELECT * FROM company_inquiries';
  let params = [];
  let conditions = [];
  
  if (technologies) {
    const techArray = technologies.split(',').map(item => item.trim()).filter(item => item !== '');
    if (techArray.length > 0) {
      // 各技術について、technology1～technology5 のどれかに部分一致する条件を作成
      techArray.forEach(tech => {
        conditions.push(`(technology1 LIKE ? OR technology2 LIKE ? OR technology3 LIKE ? OR technology4 LIKE ? OR technology5 LIKE ?)`);
        for (let i = 0; i < 5; i++) {
          params.push(`%${tech}%`);
        }
      });
    }
  }
  
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" OR ");
  }
  
  sql += " ORDER BY created_at DESC";
  
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '求人情報の取得に失敗しました' });
    }
    res.json(results);
  });
});

app.get('/protected', authenticateToken, (req, res) => {
  res.send(`認証されたユーザーです: ${req.user.username}`);
});
// GET /profile
app.get('/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'SELECT name, birth_date, affiliation, phone, email FROM user_profiles WHERE user_id = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'プロフィール情報の取得に失敗しました' });
      }
      res.json(results[0] || {});
    }
  );
});

// PUT /profile（アップサート）
app.put('/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { name, birth_date, affiliation, phone, email } = req.body;
  const sql = `
    INSERT INTO user_profiles (user_id, name, birth_date, affiliation, phone, email)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      birth_date = VALUES(birth_date),
      affiliation = VALUES(affiliation),
      phone = VALUES(phone),
      email = VALUES(email)
  `;
  const params = [userId, name, birth_date, affiliation, phone, email];
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'プロフィールの更新に失敗しました' });
    }
    res.json({ message: 'プロフィールの更新が完了しました' });
  });
});

// GET /skills
app.get('/skills', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query(
    'SELECT programming_languages, frameworks, `dbs`, cloud_platforms, dev_tools FROM user_skills WHERE user_id = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'スキル情報の取得に失敗しました' });
      }
      res.json(results[0] || {});
    }
  );
});

// PUT /skills（アップサート）
app.put('/skills', authenticateToken, (req, res) => {
  const userId = req.user.id;
  // フロント側からは snake_case 形式で送信されることを期待
  const { programming_languages, frameworks, dbs, cloud_platforms, dev_tools } = req.body;
  const sql = `
    INSERT INTO user_skills (user_id, programming_languages, frameworks, dbs, cloud_platforms, dev_tools)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      programming_languages = VALUES(programming_languages),
      frameworks = VALUES(frameworks),
      dbs = VALUES(dbs),
      cloud_platforms = VALUES(cloud_platforms),
      dev_tools = VALUES(dev_tools)
  `;
  const params = [userId, programming_languages, frameworks, dbs, cloud_platforms, dev_tools];
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'スキル情報の保存に失敗しました' });
    }
    res.json({ message: 'スキル情報の保存が完了しました' });
  });
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


