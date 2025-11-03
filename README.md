# TG Chat AI Assistant

TG Chat AI Assistant is a Telegram bot that allows you to interact with an AI assistant (using Ollama GPT models) via private messages. The bot maintains a chat history per user and responds only to selected users.

---

## Features

- Interactive user selection at startup (via checkboxes)
- Maintains per-user chat history in memory
- Only text messages are considered (media and empty messages are ignored)
- Responses are generated using the Ollama GPT model
- Easy configuration via `.env` file

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/baklai/caiass.git
cd caiass
```

2. Install dependencies:

```bash
npm install
```

3. Create a .env file in the project root:

```bash
API_ID=`your_telegram_api_id`
API_HASH=`your_telegram_api_hash`
GPT_MODEL=`your_ollama_model`
```

API_ID and API_HASH can be obtained from https://my.telegram.org

Start the bot:

```bash
npm start
```

Or in development mode (with file watching):

```bash
npm run start:dev
```

On first run, if users.ini is empty, the bot will prompt you to select which users are allowed to interact with the AI assistant.

The bot will maintain a per-user chat history and respond only to messages from allowed users.
