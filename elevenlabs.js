
// Imports e configuração
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

const elevenlabs = new ElevenLabsClient();

// Converte texto em fala usando ElevenLabs
async function textToSpeech(voiceId, text) {
  return await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
  });
}

// Lista todas as vozes disponíveis na ElevenLabs
async function listVoices() {
  const result = await elevenlabs.voices.getAll();
  return result.voices;
}

// Cria uma nova voz na ElevenLabs via API HTTP
async function createVoice({ name, files, description, labels }) {
  const form = new FormData();
  form.append('name', name);
  if (description) form.append('description', description);
  if (labels) {
    Object.entries(labels).forEach(([key, value]) => {
      if (value) form.append(`labels[${key}]`, value);
    });
  }
  files.forEach(file => {
    form.append('files', fs.createReadStream(file));
  });
  const response = await axios.post(
    'https://api.elevenlabs.io/v1/voices/add',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    }
  );
  return response.data;
}

module.exports = {
  textToSpeech,
  listVoices,
  createVoice
};