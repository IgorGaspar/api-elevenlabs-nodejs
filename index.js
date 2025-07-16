const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API funcionando! Use POST /send-audio para enviar um áudio.');
});

app.post('/send-audio', upload.single('audio'), async (req, res) => {
  try {
    const audioFilePath = req.file.path;
    // Log para depuração
    console.log('Arquivo recebido:', req.file);

    // Tipos mais comuns de wav
    const allowedTypes = [
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/mpeg',
      'audio/mp3'
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(audioFilePath);
      return res.status(400).json({ error: `Tipo de arquivo não suportado (${req.file.mimetype}).` });
    }

    const audioStream = fs.createReadStream(audioFilePath);

    const response = await axios.post('https://api.elevenlabs.io/v1/seu-endpoint', audioStream, {
      headers: {
        'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`,
        'Content-Type': req.file.mimetype,
      }
    });

    fs.unlinkSync(audioFilePath);

    res.json({ elevenLabsResponse: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const audioFilePath = req.file.path;

    // Tipos mais comuns de áudio aceitos
    const allowedTypes = [
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/mpeg',
      'audio/mp3'
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(audioFilePath);
      return res.status(400).json({ error: `Tipo de arquivo não suportado (${req.file.mimetype}).` });
    }

    // Cria o form-data para enviar para ElevenLabs
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Chama a API ElevenLabs Speech-to-Text
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'xi-api-key': process.env.ELEVENLABS_API_KEY, // ajuste conforme a documentação
        },
      }
    );

    fs.unlinkSync(audioFilePath); // Remove o arquivo local após uso

    // Retorna o texto transcrito
    res.json({ transcribed: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('API rodando na porta 3000'));