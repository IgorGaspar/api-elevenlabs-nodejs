
// =========================
// Imports e configuração
// =========================
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// =========================
// Utilitários
// =========================
const upload = multer({ dest: 'uploads/' });
const multerMultiple = multer({ dest: 'uploads/' });
const { textToSpeech, listVoices } = require('./elevenlabs');

// =========================
// Rotas principais
// =========================

// Rota de status
app.get('/', (req, res) => {
  res.send('API funcionando!');
});

// Envia áudio para processamento externo (exemplo)
app.post('/send-audio', upload.single('audio'), async (req, res) => {
  try {
    const audioFilePath = req.file.path;
    console.log('Arquivo recebido:', req.file);
    const allowedTypes = [
      'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(audioFilePath);
      return res.status(400).json({ error: `Tipo de arquivo não suportado (${req.file.mimetype}).` });
    }
    const audioStream = fs.createReadStream(audioFilePath);
    // Exemplo de chamada externa (ajuste endpoint conforme necessário)
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

// Speech-to-text usando ElevenLabs
app.post('/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    const audioFilePath = req.file.path;
    const allowedTypes = [
      'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(audioFilePath);
      return res.status(400).json({ error: `Tipo de arquivo não suportado (${req.file.mimetype}).` });
    }
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioFilePath), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
      }
    );
    fs.unlinkSync(audioFilePath);
    res.json({ transcribed: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista todas as vozes disponíveis na ElevenLabs
app.get('/voices', async (req, res) => {
  try {
    const voices = await listVoices();
    res.json(voices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Texto para fala usando ElevenLabs
app.post('/text-to-speech', async (req, res) => {
  try {
    const { voiceId, text } = req.body;
    if (!voiceId || !text) {
      return res.status(400).json({ error: 'voiceId e text são obrigatórios.' });
    }
    const audioStream = await textToSpeech(voiceId, text);
    if (!audioStream || typeof audioStream.getReader !== 'function') {
      return res.status(500).json({ error: 'Áudio não gerado ou resposta inválida da ElevenLabs.' });
    }
    // Converte ReadableStream em Buffer
    const reader = audioStream.getReader();
    let chunks = [], totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
    const audioBuffer = Buffer.concat(chunks, totalLength);
    if (audioBuffer.length < 1000) {
      return res.status(500).json({ error: 'Áudio muito pequeno ou inválido.' });
    }
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cria uma nova voz na ElevenLabs e atualiza labels
app.post('/add-voice', multerMultiple.array('audio', 5), async (req, res) => {
  try {
    const { name, description, accent, age, language, gender } = req.body;
    if (!name || !language || !req.files?.length) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, language e pelo menos um arquivo de áudio.' });
    }
    const files = req.files.map(f => f.path);
    const labels = { accent, age, language, gender };
    const { createVoice } = require('./elevenlabs');
    let voiceResponse;
    try {
      voiceResponse = await createVoice({ name, files, description, labels });
      console.log('Resposta ElevenLabs (criação voz):', voiceResponse);
    } catch (err) {
      console.error('Erro na criação da voz:', err?.response?.data || err);
      throw err;
    }
    files.forEach(f => { try { fs.unlinkSync(f); } catch {} });
    const result = voiceResponse.voice || voiceResponse;
    if (result.voice_id && Object.values(labels).some(Boolean)) {
      try {
        const form = new FormData();
        form.append('name', name);
        form.append('labels', JSON.stringify(labels));
        const updateRes = await axios.post(
          `https://api.us.elevenlabs.io/v1/voices/${result.voice_id}/edit`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            }
          }
        );
        console.log('Resposta ElevenLabs (atualização labels):', updateRes.data);
        result.updated_labels = updateRes.data;
      } catch (err) {
        console.error('Erro na atualização de labels:', err?.response?.data || err);
        result.updated_labels_error = err?.response?.data || err;
      }
    }
    res.json(result);
  } catch (error) {
    console.error('Erro final /add-voice:', error?.response?.data || error);
    res.status(500).json({ error: error.message, details: error?.response?.data });
  }
});

// Atualiza labels de uma voz existente na ElevenLabs
app.post('/update-voice-labels', async (req, res) => {
  try {
    const { voiceId, name, description, labels, removeBackgroundNoise } = req.body;
    if (!voiceId || !labels) {
      return res.status(400).json({ error: 'Campos obrigatórios: voiceId e labels.' });
    }
    const form = new FormData();
    if (name) form.append('name', name);
    if (description) form.append('description', description);
    form.append('labels', JSON.stringify(labels));
    form.append('remove_background_noise', removeBackgroundNoise ? 'true' : 'false');
    const response = await axios.post(
      `https://api.us.elevenlabs.io/v1/voices/${voiceId}/edit`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializa o servidor
app.listen(3000, () => console.log('API rodando na porta 3000'));