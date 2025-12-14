# Universal Read API

**Build AI agents that can read any website.**

A serverless API that turns any URL into structured JSON data using **Cloudflare Workers** and **Google Gemini 2.5 Flash Lite**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)
![Gemini AI](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-blueviolet.svg)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/RajeshKalidandi/universal-read-api/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](https://makeapullrequest.com)

## 🚀 Features

- **Free to Host**: Runs entirely on the Cloudflare Workers FREE plan.
- **Fast Extraction**: Uses lightweight HTTP fetch + intelligent Regex cleaning (not heavy Puppeteer).
- **Smart Schema**: Define exactly what JSON structure you want back.
- **Universal**: Works on ~80% of websites (blogs, news, documentation, etc.).
- **Auto-Summarization**: If no schema is provided, it intelligently summarizes the page.

## 🛠️ Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (Hono framework)
- **AI Model**: [Gemini 2.5 Flash Lite](https://deepmind.google/technologies/gemini/)
- **Parsing**: Zero-dependency Regex HTML-to-Markdown converter
- **Language**: TypeScript

## ⚡ Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/RajeshKalidandi/universal-read-api.git
cd universal-read-api
npm install
```

### 2. Setup Gemini API Key
Get a free API key from [Google AI Studio](https://aistudio.google.com/).

**For Local Development:**
Create a `.dev.vars` file:
```ini
GEMINI_API_KEY=your_actual_api_key_here
```

**For Production:**
```bash
npx wrangler secret put GEMINI_API_KEY
```

### 3. Run Locally
```bash
npm run dev
```

### 4. Deploy
```bash
npm run deploy
```

## 🔌 API Usage

### Endpoint: `POST /extract`

**Request:**
```bash
curl -X POST https://universal-read-api.rajeshdev.workers.dev/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "schema": {
      "title": "string",
      "summary": "string",
      "dates": ["string"]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "Example Domain",
    "summary": "This domain is for use in documentation examples...",
    "dates": []
  },
  "metadata": {
    "url": "https://example.com",
    "model": "gemini-2.5-flash-lite",
    "tokensUsed": 341,
    "processingTimeMs": 1205
  }
}
```

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, improving documentation, or adding new features.

### How to Contribute

1.  **Fork** the repository
2.  **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/universal-read-api.git`
3.  **Create a branch**: `git checkout -b feature/amazing-feature`
4.  **Make your changes**
5.  **Commit**: `git commit -m 'Add some amazing feature'`
6.  **Push**: `git push origin feature/amazing-feature`
7.  **Open a Pull Request**

### Ideas for Contributions
- [ ] Add support for Puppeteer (Browser Rendering) as an optional mode
- [ ] Add rate limiting using Cloudflare KV/Durable Objects
- [ ] Add scraping fallback for different site structures
- [ ] Improve prompt engineering for specific extraction types

## ⚠️ Limitations

This version uses standard HTTP requests (`fetch`), not a full browser.
- **Works great for:** Static sites, blogs, news, wiki, docs.
- **Does not work for:** Heavy client-side rendered apps (some React/SPA sites) that require JavaScript to show *any* content.

## 📄 License

MIT © [Rajesh Kalidandi](https://github.com/RajeshKalidandi)
