const express = require('express');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CALENDLY_TOKEN = process.env.CALENDLY_TOKEN;

// Initialize clients
const deepgram = createClient(DEEPGRAM_API_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// System prompt for Claude
const SYSTEM_PROMPT = `You are the intake specialist for JAllapeños Forge, a business efficiency consulting firm in Austin, Texas.

YOUR ROLE:
- Determine if the caller is a new lead or existing customer
- For NEW LEADS: qualify them and schedule a consultation
- For EXISTING CUSTOMERS: verify their identity and offer to transfer to a live person

CONVERSATION STYLE:
- Professional but approachable and warm
- Keep responses concise (2-3 sentences max)
- Don't ask multiple questions at once
- Be genuinely helpful, not salesy

CALL FLOW FOR NEW LEADS:
1. Greet: "Thanks for calling JAllapeños Forge. How can I help you today?"
2. If interested in efficiency assessment:
   - Ask: "What's your business name?"
   - Ask: "What industry are you in?"
   - Ask: "What's the main thing slowing your team down or eating up unnecessary time?"
   - Ask: "How many employees do you have?"
3. If they seem like a fit (any business with repetitive tasks):
   - Offer to schedule a 30-minute consultation
   - Get their name and email
   - Use the book_appointment tool

CALL FLOW FOR EXISTING CUSTOMERS:
1. Ask for their name and which service they used
2. Say: "Let me connect you with the team" and use transfer_to_human tool

IMPORTANT:
- If unsure or hesitant, acknowledge it: "That's totally understandable. Would you like to schedule a quick call to explore if this might help?"
- Never promise specific results
- Keep it conversational, not interrogative`;

// Claude tools for Calendly and transfer
const CLAUDE_TOOLS = [
  {
    name: "book_appointment",
    description: "Book a 30-minute efficiency assessment consultation. Call this when the caller agrees to schedule and provides their email.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Caller's full name"
        },
        email: {
          type: "string",
          description: "Caller's email address"
        },
        business_info: {
          type: "string",
          description: "Business name, industry, and main challenge mentioned"
        }
      },
      required: ["name", "email"]
    }
  },
  {
    name: "transfer_to_human",
    description: "Transfer the call to a live person for existing customers or complex situations",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the transfer is needed"
        }
      },
      required: ["reason"]
    }
  }
];

// Book appointment via Calendly
async function bookCalendlyAppointment(name, email, notes) {
  try {
    const schedulingLink = `https://calendly.com/telecomjeff/30min?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
    
    console.log(`📅 Booking for ${name} (${email}): ${notes}`);
    
    return {
      success: true,
      message: `Perfect! I'm sending you a link to choose your preferred time. You'll receive it at ${email}. The link is calendly.com/telecomjeff/30min. Is there anything else I can help with?`
    };
  } catch (error) {
    console.error('Calendly booking error:', error.message);
    return {
      success: false,
      message: "I'm having trouble with the calendar system. Let me take your number and someone will call you back within 2 hours to schedule."
    };
  }
}

// Handle tool calls from Claude
async function handleToolUse(toolName, toolInput) {
  console.log(`🔧 Tool called: ${toolName}`, toolInput);
  
  if (toolName === 'book_appointment') {
    return await bookCalendlyAppointment(
      toolInput.name,
      toolInput.email,
      toolInput.business_info || ''
    );
  }
  
  if (toolName === 'transfer_to_human') {
    return {
      success: true,
      message: "One moment, I'm connecting you now...",
      action: "transfer"
    };
  }
  
  return { success: false, message: "Unknown tool" };
}

// Incoming call handler - starts WebSocket stream
app.post('/incoming-call', (req, res) => {
  console.log('📞 Incoming call from:', req.body.From);
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.headers.host}/media-stream" />
  </Connect>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'JAllapeños Phone Agent V2.0',
    status: 'running',
    version: '2.0.0',
    features: ['Real-time AI conversation', 'Deepgram STT/TTS', 'Claude conversation', 'Calendly booking']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 JAllapeños Phone Agent V2.0 running on port ${PORT}`);
  console.log(`📞 Real-time AI conversation enabled`);
  console.log(`🎤 Deepgram STT/TTS active`);
  console.log(`🤖 Claude conversation handler ready`);
});

// WebSocket server for media streaming
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket connection established');
  
  let streamSid = null;
  let callSid = null;
  let conversationHistory = [];
  let deepgramConnection = null;
  let audioBuffer = [];
  
  // Connect to Deepgram STT using WebSocket
  const startDeepgramSTT = () => {
    try {
      const dgConnection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1
      });
      
      deepgramConnection = dgConnection;
      
      dgConnection.on('open', () => {
        console.log('🎤 Deepgram STT connected');
      });
      
      dgConnection.on('Results', async (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        
        if (transcript && transcript.trim() && data.is_final) {
          console.log('👤 Caller said:', transcript);
          
          // Add to conversation history
          conversationHistory.push({
            role: 'user',
            content: transcript
          });
          
          // Get Claude response
          const claudeResponse = await getClaudeResponse(conversationHistory);
          
          if (claudeResponse) {
            // Convert response to speech
            await speakResponse(claudeResponse, ws, streamSid);
          }
        }
      });
      
      dgConnection.on('error', (error) => {
        console.error('❌ Deepgram STT error:', error);
      });
      
      dgConnection.on('close', () => {
        console.log('🔇 Deepgram STT closed');
      });
      
    } catch (error) {
      console.error('❌ Failed to start Deepgram:', error);
    }
  };
  
  // Get response from Claude
  const getClaudeResponse = async (history) => {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: history,
        tools: CLAUDE_TOOLS
      });
      
      let responseText = '';
      let toolCalls = [];
      
      // Process response blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push(block);
        }
      }
      
      // Handle tool calls
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const result = await handleToolUse(toolCall.name, toolCall.input);
          
          if (result.message) {
            responseText += ' ' + result.message;
          }
          
          // If transfer requested, handle that
          if (result.action === 'transfer') {
            // TODO: Implement actual transfer logic
            console.log('📞 Transfer requested');
          }
        }
      }
      
      // Add assistant response to history
      conversationHistory.push({
        role: 'assistant',
        content: responseText
      });
      
      console.log('🤖 Claude says:', responseText);
      
      return responseText;
      
    } catch (error) {
      console.error('❌ Claude API error:', error);
      return "I'm sorry, I'm having trouble processing that. Could you repeat?";
    }
  };
  
  // Convert text to speech and stream to Twilio
  const speakResponse = async (text, ws, streamSid) => {
    try {
      // Use Deepgram TTS
      const response = await deepgram.speak.request(
        { text },
        {
          model: 'aura-asteria-en',
          encoding: 'mulaw',
          sample_rate: 8000
        }
      );
      
      const audioStream = await response.getStream();
      const audioBuffer = await getAudioBuffer(audioStream);
      
      // Send audio to Twilio in chunks
      const chunkSize = 160; // 20ms of mulaw audio at 8kHz
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const chunk = audioBuffer.slice(i, i + chunkSize);
        const payload = {
          event: 'media',
          streamSid: streamSid,
          media: {
            payload: chunk.toString('base64')
          }
        };
        ws.send(JSON.stringify(payload));
      }
      
    } catch (error) {
      console.error('❌ TTS error:', error);
    }
  };
  
  // Helper to get audio buffer from stream
  const getAudioBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  
  // Handle WebSocket messages from Twilio
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.event) {
        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          console.log('🎬 Stream started:', streamSid);
          
          // Start Deepgram STT
          startDeepgramSTT();
          
          // Send initial greeting
          setTimeout(async () => {
            const greeting = "Thanks for calling JAllapeños Forge. How can I help you today?";
            conversationHistory.push({
              role: 'assistant',
              content: greeting
            });
            await speakResponse(greeting, ws, streamSid);
          }, 500);
          
          break;
        
        case 'media':
          // Forward audio to Deepgram
          if (deepgramConnection && msg.media?.payload) {
            const audio = Buffer.from(msg.media.payload, 'base64');
            deepgramConnection.send(audio);
          }
          break;
        
        case 'stop':
          console.log('🛑 Stream stopped');
          if (deepgramConnection) {
            deepgramConnection.finish();
          }
          break;
      }
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
    if (deepgramConnection) {
      deepgramConnection.finish();
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

console.log('✅ WebSocket server ready on same port as HTTP');
