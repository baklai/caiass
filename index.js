import { checkbox } from '@inquirer/prompts';
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import ollama from 'ollama';
import readline from 'readline';
import { TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events/index.js';
import { StringSession } from 'telegram/sessions/index.js';

import { getId } from './utils/index.js';

dotenv.config();

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const GPT_MODEL = process.env.GPT_MODEL;
const SESSION_FILE = 'session.ini';
const USERS_FILE = 'users.ini';

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
  const sessionString = existsSync(SESSION_FILE)
    ? readFileSync(SESSION_FILE, 'utf8')
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
  writeFileSync(SESSION_FILE, session);

  const allowedUsers = existsSync(USERS_FILE)
    ? readFileSync(USERS_FILE, 'utf8')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  if (allowedUsers.length === 0) {
    console.info('⚙️ Select users to allow:\n');

    const dialogs = [];
    for await (const dialog of client.iterDialogs({ limit: 100 })) {
      if (dialog.isUser && dialog.entity?.id && !dialog.entity.bot) {
        dialogs.push({
          name:
            `${dialog.entity?.firstName || ''} ${
              dialog.entity?.lastName || ''
            }`.trim() ||
            dialog.entity.username ||
            dialog.entity.id.toString(),
          value: dialog.entity.id.toString()
        });
      }
    }

    if (dialogs.length === 0) {
      process.exit('😢 No users found');
    } else {
      const selectedUsers = await checkbox({
        message: 'Select users:',
        choices: dialogs,
        pageSize: 15
      });

      allowedUsers.push(...selectedUsers);

      writeFileSync(USERS_FILE, allowedUsers.join('\n'));

      console.info('✅ Selected users:', allowedUsers.join(', '));
    }

    if (allowedUsers.length === 0) {
      process.exit('😢 No users found');
    }
  }

  console.info('✅ Allowed users:', allowedUsers.join(', '));

  const userMessages = {};

  for (const allowedUser of allowedUsers) {
    const userEntity = await client.getEntity(allowedUser);

    userMessages[allowedUser] = [];

    for await (const msg of client.iterMessages(userEntity, { limit: 500 })) {
      if (!msg.text || msg.text.trim() === '') continue;

      const senderId = msg.senderId?.toString();
      const userId = userEntity.id?.toString();

      if (senderId === userId) {
        userMessages[allowedUser].unshift({ role: 'user', content: msg.text });
      } else {
        userMessages[allowedUser].unshift({
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

    if (!senderId || !allowedUsers.includes(senderId)) return;

    console.info(`User ${senderId}:`, message.text);

    userMessages[senderId].push({ role: 'user', content: message.text });

    const response = await ollama.chat({
      model: GPT_MODEL,
      messages: [SYSTEM_MESSAGE, ...userMessages[senderId]],
      max_tokens: 250,
      stream: false
    });

    if (response?.message?.content) {
      console.info('Me:', response.message.content);
      userMessages[senderId].push({
        role: 'assistant',
        content: response.message.content
      });
      await client.sendMessage(sender, { message: response.message.content });
    }
  }

  client.addEventHandler(eventMessage, new NewMessage({}));

  console.info("🤖 The bot is ready. We're waiting for messages....");
  rl.close();
})();
