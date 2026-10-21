/* global fetch */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cuePath = path.join(root, 'src', 'data', 'narrationCues.json');
const outputRoot = path.join(root, 'public', 'runtime-public', 'audio', 'narration');
const provider = process.env.NARRATION_PROVIDER ?? 'edge';

function readEnvValue(contents, name) {
  const prefix = `${name}=`;
  const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim() ?? '';
}

async function loadApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envFile = await readFile(path.join(root, '.env.local'), 'utf8');
  return readEnvValue(envFile, 'OPENAI_API_KEY');
}

const voiceInstructions = {
  can: 'Speak in natural, fluent Hong Kong Cantonese. Warm, clear educational guide. Moderate pace. Pronounce letter names separately when reading D O.',
  pth: 'Speak in clear standard Mandarin Chinese. Warm, clear educational guide. Moderate pace. Pronounce letter names separately when reading D O.',
  eng: 'Speak in clear international English. Warm, clear educational guide. Moderate pace. Pronounce D O as two separate letters.',
};

const edgeVoices = {
  can: 'zh-HK-HiuGaaiNeural',
  pth: 'zh-CN-XiaoxiaoNeural',
  eng: 'en-US-JennyNeural',
};

const edgeRates = {
  can: '+12%',
  pth: '+8%',
  eng: '+5%',
};

async function generateWithEdge(cueId, voice, text) {
  const destination = path.join(outputRoot, voice, `${cueId}.mp3`);
  await mkdir(path.dirname(destination), { recursive: true });
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          'python',
          [
            '-m',
            'edge_tts',
            '--voice',
            edgeVoices[voice],
            `--rate=${edgeRates[voice]}`,
            '--text',
            text,
            '--write-media',
            destination,
          ],
          { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
        );
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(`${cueId}/${voice}: edge-tts exited ${code}: ${stderr.slice(0, 240)}`),
            );
        });
      });
      process.stdout.write(`generated ${voice}/${cueId}.mp3\n`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 1200);
    }
  }
  throw lastError;
}

async function generateOne(apiKey, cueId, voice, text) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: text,
      instructions: voiceInstructions[voice],
      response_format: 'mp3',
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${cueId}/${voice}: ${response.status} ${details.slice(0, 240)}`);
  }
  const destination = path.join(outputRoot, voice, `${cueId}.mp3`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`generated ${voice}/${cueId}.mp3\n`);
}

const cues = JSON.parse(await readFile(cuePath, 'utf8'));
const argumentsAfterScript = process.argv.slice(2);
const onlyIndex = argumentsAfterScript.indexOf('--only');
const requestedCueIds =
  onlyIndex < 0
    ? []
    : argumentsAfterScript.slice(onlyIndex + 1).filter((value) => value.length > 0);
const allCueEntries = Object.entries(cues);
const startCue = onlyIndex < 0 ? argumentsAfterScript[0] : undefined;
const startIndex =
  startCue === undefined ? 0 : allCueEntries.findIndex(([cueId]) => cueId === startCue);
if (startCue !== undefined && startIndex < 0) throw new Error(`Unknown narration cue: ${startCue}`);
const cueEntries =
  requestedCueIds.length === 0
    ? allCueEntries.slice(Math.max(0, startIndex))
    : requestedCueIds.map((cueId) => {
        const scripts = cues[cueId];
        if (scripts === undefined) throw new Error(`Unknown narration cue: ${cueId}`);
        return [cueId, scripts];
      });
const apiKey = provider === 'openai' ? await loadApiKey() : '';
if (provider === 'openai' && !apiKey) throw new Error('OPENAI_API_KEY is not configured.');
for (const [cueId, scripts] of cueEntries) {
  for (const voice of ['can', 'pth', 'eng']) {
    if (provider === 'openai') await generateOne(apiKey, cueId, voice, scripts[voice]);
    else await generateWithEdge(cueId, voice, scripts[voice]);
  }
}
