# JAllapeños Phone Agent

AI-powered phone intake system for efficiency assessment consultations.

## Features

- Answers incoming calls to Twilio number
- Routes new leads vs existing customers
- Collects caller information
- Integrates with Calendly for scheduling
- Records messages for follow-up

## Deployment to Railway

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: JAllapeños Phone Agent"
gh repo create jallapenos-phone-agent --public --source=. --remote=origin
git push -u origin main
```

### Step 2: Deploy on Railway

1. Go to railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `jallapenos-phone-agent`
5. Railway will auto-detect Node.js and deploy

### Step 3: Set Environment Variables in Railway

Go to your project settings → Variables tab and add:

```
CALENDLY_TOKEN=eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ...
```

Railway automatically sets PORT, so no need to add that.

### Step 4: Get your Railway URL

After deployment, Railway gives you a URL like:
```
https://jallapenos-phone-agent-production.up.railway.app
```

### Step 5: Configure Twilio Webhook

1. Go to Twilio Console → Phone Numbers
2. Click your number (+1 512 812 8758)
3. Under "Voice Configuration":
   - A CALL COMES IN: Webhook
   - URL: `https://your-railway-url.up.railway.app/incoming-call`
   - HTTP POST
4. Save

## Testing

Call your Twilio number: +1 512 812 8758

You should hear:
"Thanks for calling JAllapeños Forge. For a free efficiency assessment, press 1..."

## Current Implementation

This is **Version 1.0** - a basic IVR (Interactive Voice Response) system that:
- Greets callers
- Offers menu options (press 1 for assessment, press 2 for existing customers)
- Records messages for follow-up

## Roadmap to Full AI

**Version 2.0** will add:
- Real-time AI conversation (no button pressing)
- Speech-to-text → Claude → Text-to-speech pipeline
- Automatic Calendly booking during the call
- Natural language qualification

This requires:
- WebSocket streaming between Twilio and your server
- Integration with Deepgram (STT) and ElevenLabs (TTS)
- Real-time Claude API calls

We're starting with V1.0 to get operational TODAY, then upgrading to V2.0 once the basic flow is proven.

## Support

For issues or questions, check the Railway logs:
```bash
railway logs
```
