// =================================================================
// GOOGLE DRIVE AUDIO STREAMER BACKEND (Express + Axios)
// =================================================================

const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyaları hem 'public' klasöründen hem kök dizinden servis et
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

/**
 * GET /
 * Anasayfa kök dizin isteğinde index.html dosyasını hem public klasöründe hem de kök dizinde arar
 */
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');

  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send('index.html dosyası bulunamadı. Lütfen GitHub reponuzda public/index.html veya index.html dosyasının olduğunu kontrol edin.');
  }
});

/**
 * GET /api/info/:id
 * Google Drive dosya ID'sinden dosya adını çeker ve temizler.
 */
app.get('/api/info/:id', async (req, res) => {
  const driveId = req.params.id;
  try {
    const googleRes = await axios.get(`https://drive.google.com/file/d/${driveId}/view`, {
      timeout: 4000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const match = googleRes.data.match(/<title>(.*?)<\/title>/);
    let rawTitle = match ? match[1] : '';
    rawTitle = rawTitle.replace(/\s*-\s*Google Drive\s*$/i, '').trim();
    rawTitle = rawTitle.replace(/\.(mp3|wav|m4a|flac|aac|ogg)$/i, '').trim();

    let name = rawTitle;
    let artist = "Bilinmeyen Sanatçı";

    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      artist = parts[0].trim();
      name = parts.slice(1).join(' - ').trim();
    } else if (rawTitle.includes(' – ')) {
      const parts = rawTitle.split(' – ');
      artist = parts[0].trim();
      name = parts.slice(1).join(' – ').trim();
    }

    res.json({
      driveId,
      name: name || rawTitle,
      artist: artist,
      rawTitle: rawTitle
    });
  } catch (error) {
    res.json({
      driveId,
      name: `Drive Parça (${driveId.substring(0, 6)}...)`,
      artist: 'Google Drive',
      rawTitle: 'Google Drive Müzik'
    });
  }
});

/**
 * GET /download/:id
 * MP3 dosyasını orijinal şarkı adıyla otomatik indirtir.
 */
app.get('/download/:id', async (req, res) => {
  const driveId = req.params.id;
  const driveUrl = `https://docs.google.com/uc?export=download&id=${driveId}&confirm=t`;

  try {
    let filename = `Song-${driveId}.mp3`;
    try {
      const infoRes = await axios.get(`https://drive.google.com/file/d/${driveId}/view`, {
        timeout: 3000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const match = infoRes.data.match(/<title>(.*?)<\/title>/);
      if (match) {
        let t = match[1].replace(/\s*-\s*Google Drive\s*$/i, '').trim();
        if (!/\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(t)) {
          t += '.mp3';
        }
        filename = t;
      }
    } catch(e) {}

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    const streamRes = await axios({
      method: 'get',
      url: driveUrl,
      responseType: 'stream',
      maxRedirects: 5
    });

    streamRes.data.pipe(res);
  } catch (error) {
    console.error('İndirme hatası:', error.message);
    res.status(500).send('İndirme başlatılamadı.');
  }
});

/**
 * GET /stream/:id
 * Google Drive MP3 akış köprüsü
 */
app.get('/stream/:id', async (req, res) => {
  const driveId = req.params.id;
  const driveUrl = `https://docs.google.com/uc?export=download&id=${driveId}&confirm=t`;

  try {
    const headers = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const googleRes = await axios({
      method: 'get',
      url: driveUrl,
      headers: headers,
      responseType: 'stream',
      maxRedirects: 5
    });

    if (googleRes.headers['content-type']) {
      res.setHeader('Content-Type', googleRes.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'audio/mpeg');
    }

    if (googleRes.headers['content-length']) {
      res.setHeader('Content-Length', googleRes.headers['content-length']);
    }

    if (googleRes.headers['content-range']) {
      res.setHeader('Content-Range', googleRes.headers['content-range']);
    }

    if (googleRes.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', googleRes.headers['accept-ranges']);
    }

    res.status(googleRes.status);
    googleRes.data.pipe(res);

    req.on('close', () => {
      if (googleRes.data && googleRes.data.destroy) {
        googleRes.data.destroy();
      }
    });

  } catch (error) {
    console.error('Müzik akış hatası:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Müzik akışı başlatılamadı.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`>>> Sunucu çalışıyor: http://localhost:${PORT}`);
});
