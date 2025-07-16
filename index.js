require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });
const app = express();

app.post('/send-audio', upload.single('audio'), async (req, res) => {
  try {
    const audioFilePath = req.file.path;
    // Leia o arquivo e prepare para envio à ElevenLabs
    const audioStream = fs.createReadStream(audioFilePath);

    // Exemplo de chamada para ElevenLabs (ajuste conforme a documentação deles)
    const response = await axios.post('https://api.elevenlabs.io/v1/endpoint', audioStream, {
      headers: {
        'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`,
        'Content-Type': 'audio/mpeg', // ou o tipo correto do arquivo
      }
    });

    // Remova o arquivo temporário
    fs.unlinkSync(audioFilePath);

    res.json({ elevenLabsResponse: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('API rodando na porta 3000'));