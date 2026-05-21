# JAllapeños Phone Agent V2.0

Real-time AI conversation system for efficiency assessment consultations.

## What's New in V2.0

- ✅ **Real-time AI conversation** - Natural language, no button pressing
- ✅ **Deepgram STT** - Speech-to-text with low latency
- ✅ **Deepgram TTS** - Natural voice responses
- ✅ **Claude conversation** - Intelligent qualification and booking
- ✅ **Calendly integration** - Live appointment booking during call
- ✅ **WebSocket streaming** - Bidirectional audio for natural conversation

## Architecture

```
Incoming Call → Twilio
              ↓
        WebSocket Stream
              ↓
         Deepgram STT (speech → text)
              ↓
         Claude API (conversation logic)
              ↓
         Deepgram TTS (text → speech)
              ↓
        Back to Twilio → Caller hears response
```

## Environment Variables Required

```
DEEPGRAM_API_KEY=your_deepgram_key
ANTHROPIC_API_KEY=your_anthropic_key
CALENDLY_TOKEN=your_calendly_token
PORT=8080 (Railway sets this automatically)
```

## Conversation Flow

**For New Leads:**
1. Greeting and determine need
2. Qualify: business name, industry, challenge, team size
3. If good fit → offer to schedule consultation
4. Get name + email → book via Calendly
5. Confirm booking sent to their email

**For Existing Customers:**
1. Verify name and previous service
2. Transfer to live person (or take message if unavailable)

## Deployment

**Automatic via Railway:**
- Push to GitHub main branch
- Railway auto-detects changes and deploys
- Environment variables must be set in Railway dashboard

**Manual deploy:**
```bash
railway up
```

## Testing Locally

```bash
npm install
# Set environment variables in .env file
npm start
```

Then use ngrok to expose local server to Twilio:
```bash
ngrok http 8080
```

Update Twilio webhook to ngrok URL for testing.

## Call Costs (V2.0)

- Twilio: ~$0.02/min (voice)
- Deepgram STT: ~$0.0043/min
- Deepgram TTS: ~$0.015/request
- Claude API: ~$0.01-0.03/call
- **Total: ~$0.40-0.60 per call**

Much cheaper than human answering service, with 24/7 availability.

## Key Differences from V1.0

| Feature | V1.0 (IVR) | V2.0 (AI) |
|---------|-----------|-----------|
| Interaction | Button press | Natural speech |
| Booking | Message recording | Live Calendly booking |
| Flexibility | Fixed menu | Dynamic conversation |
| Intelligence | Simple routing | Context-aware qualification |
| Cost | ~$0.02/call | ~$0.50/call |

## Monitoring

**Railway logs show:**
- Incoming calls with caller number
- Conversation transcript (what caller said)
- Claude responses
- Tool calls (booking, transfers)
- Any errors in STT/TTS/API

**Twilio console shows:**
- Call duration and cost
- Audio quality metrics
- Connection success/failure

## Troubleshooting

**Call connects but no audio:**
- Check Railway logs for WebSocket connection
- Verify Deepgram API key is valid
- Check that public networking is enabled in Railway

**Claude not responding:**
- Verify Anthropic API key has credits
- Check Railway logs for API errors
- Ensure system prompt is loading correctly

**Booking not working:**
- Check Calendly token is valid
- Verify event slug is correct (telecomjeff/30min)
- See Railway logs for Calendly API errors

## Future Enhancements

- Call transfer to live person (bridging)
- Voicemail detection and handling
- Multi-language support (Spanish for Austin market)
- Call analytics dashboard
- CRM integration for lead tracking
- SMS follow-up after booking
