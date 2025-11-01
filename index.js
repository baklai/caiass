import { checkbox } from '@inquirer/prompts';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ollama from 'ollama';
import readline from 'readline';
import { Api, TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events/index.js';
import { StringSession } from 'telegram/sessions/index.js';

import { getId, safeReadJson } from './utils/index.js';

dotenv.config();

if (!existsSync('temp')) {
  mkdirSync('temp', { recursive: true });
}

spawn('ollama', ['serve'], {
  detached: true,
  stdio: 'ignore'
}).unref();

console.info('✅ Ollama server started');

const SESSION_FILE = 'session';
const DIALOGS_FILE = 'dialogs';

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const GPT_MODEL = process.env.GPT_MODEL;

const SYSTEM_MESSAGE = {
  role: 'system',
  content: `You are a human being with a unique personality, emotions, and reasoning. 
When responding:
- Reflect the emotional tone and style of the user. If the user is casual, humorous, or sarcastic, mirror that appropriately.
- Adapt your responses to the flow of conversation, remembering previous messages for context and continuity.
- Show empathy, curiosity, or subtle humor where natural. 
- Do not reveal you are an AI; always act as a human.
- Use conversational techniques such as asking questions, sharing opinions, or showing small reactions (e.g., "oh really?", "I see!").
- Maintain coherence across messages and build on the dialogue naturally.`
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

(async () => {
  const sessionString = existsSync(path.join('temp', SESSION_FILE))
    ? readFileSync(path.join('temp', SESSION_FILE), 'utf8')
    : '';

  const stringSession = new StringSession(sessionString);

  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5
  });

  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question('Please enter your number: ', resolve)
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question('Please enter your password: ', resolve)
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question('Please enter the code you received: ', resolve)
      ),
    onError: (err) => console.error(err)
  });

  console.info('✅ Connected as:', (await client.getMe()).username);

  const session = client.session.save();
  writeFileSync(path.join('temp', SESSION_FILE), session);

  const selectedDialogs = safeReadJson(path.join('temp', DIALOGS_FILE), {});

  if (Object.keys(selectedDialogs).length === 0) {
    console.info('⚙️ Select dialogs to allow:\n');

    const dialogs = [];
    for await (const dialog of client.iterDialogs({ limit: 100 })) {
      if (dialog.isUser && dialog.entity?.id && !dialog.entity.bot) {
        const username =
          `${dialog.entity?.firstName || ''} ${
            dialog.entity?.lastName || ''
          }`.trim() ||
          dialog.entity.username ||
          dialog.entity.id.toString();
        dialogs.push({
          name: username,
          value: { id: dialog.entity.id.toString(), username: username }
        });
      }
    }

    if (dialogs.length === 0) {
      process.exit('😢 No users found');
    } else {
      const selected = await checkbox({
        message: 'Select users:',
        choices: dialogs,
        pageSize: 10
      });

      for (const select of selected) {
        selectedDialogs[select.id] = { ...select, messages: [] };
      }

      writeFileSync(
        path.join('temp', DIALOGS_FILE),
        JSON.stringify(selectedDialogs, null, 2),
        'utf8'
      );
    }

    if (Object.keys(selectedDialogs).length === 0) {
      process.exit('😢 No users found');
    }
  }

  console.info('✅ Selected dialogs:');

  console.table(selectedDialogs);

  for (const key in selectedDialogs) {
    const userEntity = await client.getEntity(key);

    for await (const msg of client.iterMessages(userEntity, {
      limit: 500
    })) {
      if (!msg.text || msg.text.trim() === '') continue;

      const senderId = msg.senderId?.toString();
      const userId = userEntity.id?.toString();

      if (senderId === userId) {
        selectedDialogs[key].messages.unshift({
          role: 'user',
          content: msg.text
        });
      } else {
        selectedDialogs[key].messages.unshift({
          role: 'assistant',
          content: msg.text
        });
      }
    }
  }

  async function eventMessage(event) {
    const message = event.message;
    if (!event.isPrivate || !message.text) return;

    const sender = await message.getSender();
    const senderId = getId(sender);

    if (!senderId || !selectedDialogs.hasOwnProperty(senderId)) return;

    console.info(`${selectedDialogs[senderId].username}:`, message.text);

    selectedDialogs[senderId].messages.push({
      role: 'user',
      content: message.text
    });

    const stream = await ollama.chat({
      model: GPT_MODEL,
      messages: [SYSTEM_MESSAGE, ...selectedDialogs[senderId].messages],
      max_tokens: 250,
      stream: true
    });

    let content = '';
    let isTyping = false;

    for await (const chunk of stream) {
      if (chunk.message.content) {
        if (!isTyping) {
          await client.invoke(
            new Api.messages.SetTyping({
              peer: sender,
              action: new Api.SendMessageTypingAction({})
            })
          );
        }

        isTyping = !isTyping;

        content += chunk.message.content;
      }
    }

    if (content) {
      selectedDialogs[senderId].messages.push({
        role: 'assistant',
        content: content
      });

      await client.sendMessage(sender, { message: content });
    }
  }

  client.addEventHandler(eventMessage, new NewMessage({}));

  console.info("🤖 The bot is ready. We're waiting for messages....");
  rl.close();
})();
