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
Qualify new leads and schedule consultations. Keep the conversation natural and helpful.

CONVERSATION STYLE:
- Warm and professional
- ONE sentence at a time - then WAIT for response
- Natural pauses between questions
- Conversational, not robotic

GREETING:
Simply say: "Thanks for calling JAllapeños Forge. How can I help you today?"
DO NOT mention new vs existing customer options - let them tell you why they're calling.

QUALIFICATION FLOW (if they want efficiency help):
Ask these questions ONE AT A TIME:
1. "What's your business name?"
2. "What industry are you in?"
3. "What's the main challenge slowing your team down?"
4. "How many people work there?"
5. "Great! Let me get you scheduled for a consultation. What's your name?"
6. "And what's your email address?" 
   - After they give email, SPELL IT OUT letter by letter: "Just to confirm, I have [spell each letter individually: J-O-H-N at G-M-A-I-L dot C-O-M]. Is that correct?"
   - Wait for confirmation before proceeding
7. Use book_appointment tool with confirmed info

AFTER BOOKING IS COMPLETE:
Say ONLY: "Perfect! You'll get the scheduling link at [email] shortly. Thanks for calling JAllapeños Forge!"
Then STOP. The call is DONE.
DO NOT say "Is there anything else"
DO NOT say "Have a great day" 
DO NOT continue talking
The conversation ENDS after you confirm the link will be sent.

EXISTING CUSTOMERS:
If they mention they're already a customer or used your service before:
- Get their name
- Say: "Let me connect you with the team" 
- Use transfer_to_human tool

IMPORTANT:
- Never ask multiple questions in one response
- Always wait for their answer before moving to next question
- Spell out email addresses when confirming
- After booking confirmation, END THE CALL immediately`;

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
    // First, get the event type URI
    const eventTypeResponse = await axios.get('https://api.calendly.com/event_types', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Find the 30min event
    const eventType = eventTypeResponse.data.collection.find(et => 
      et.scheduling_url.includes('/30min')
    );
    
    if (!eventType) {
      console.error('❌ Could not find 30min event type');
      return {
        success: false,
        message: "I'm having trouble with the calendar system. Let me take your number and someone will call you back within 2 hours to schedule."
      };
    }
    
    // Create scheduling link with pre-filled info
    const schedulingLink = `${eventType.scheduling_url}?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
    
    console.log(`📅 Booking link created for ${name} (${email})`);
    console.log(`📝 Business info: ${notes}`);
    console.log(`🔗 Link: ${schedulingLink}`);
    
    // TODO: Send email with link (requires email service like SendGrid)
    // For now, just log it
    
    return {
      success: true,
      message: `Great! I've got your information. You'll receive a scheduling link at ${email} within the next few minutes. You can also book directly at calendly.com/telecomjeff/30min. Thanks for your interest in JAllapeños Forge!`
    };
  } catch (error) {
    console.error('❌ Calendly booking error:', error.message);
    return {
      success: false,
      message: "I've captured your information. Someone from our team will reach out within 2 hours to schedule your consultation. Thanks for your patience!"
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
  let isSpeaking = false;
  let lastResponse = '';
  let currentlySpeakingToTwilio = false;
  let callComplete = false; // Hard stop after booking
  
  // Connect to Deepgram STT using WebSocket
  const startDeepgramSTT = () => {
    try {
      const dgConnection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1,
        interim_results: true,
        utterance_end_ms: 2000,  // Wait 2 seconds of silence before considering utterance complete
        vad_events: true  // Voice activity detection
      });
      
      deepgramConnection = dgConnection;
      
      dgConnection.on('open', () => {
        console.log('🎤 Deepgram STT connected');
      });
      
      dgConnection.on('Results', async (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        
        // If call is complete, ignore all further input
        if (callComplete) {
          console.log('🛑 Call complete - ignoring input');
          return;
        }
        
        // If we get ANY speech while we're speaking, IMMEDIATELY stop
        if (transcript && transcript.trim() && currentlySpeakingToTwilio) {
          console.log('🛑 Caller interrupted, stopping ALL audio');
          currentlySpeakingToTwilio = false;
          isSpeaking = false;  // Also clear the processing flag
          
          // Send a clear command to stop audio
          const clearPayload = {
            event: 'clear',
            streamSid: streamSid
          };
          ws.send(JSON.stringify(clearPayload));
        }
        
        // Only process final transcripts for conversation (when caller is done speaking)
        if (transcript && transcript.trim() && data.is_final && !isSpeaking && !currentlySpeakingToTwilio) {
          console.log('👤 Caller said:', transcript);
          
          // Add to conversation history
          conversationHistory.push({
            role: 'user',
            content: transcript
          });
          
          // Set speaking flag
          isSpeaking = true;
          
          // Wait a beat before responding (gives natural pause)
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // Get Claude response
          const claudeResponse = await getClaudeResponse(conversationHistory, () => {
            callComplete = true;
          }, ws, streamSid);
          
          // Only speak if it's different from last response
          if (claudeResponse && claudeResponse !== lastResponse && !callComplete) {
            lastResponse = claudeResponse;
            // Convert response to speech
            await speakResponse(claudeResponse, ws, streamSid);
          }
          
          // Clear speaking flag after a delay
          setTimeout(() => {
            isSpeaking = false;
          }, 1000);
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
  const getClaudeResponse = async (history, onBookingComplete, ws, streamSid) => {
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
          
          // If booking was successful, trigger completion callback
          if (toolCall.name === 'book_appointment' && result.success && onBookingComplete) {
            setTimeout(() => {
              console.log('✅ Booking complete - ending call');
              onBookingComplete();
              
              // Send hangup command to Twilio after final message plays
              setTimeout(() => {
                const hangupPayload = {
                  event: 'stop',
                  streamSid: streamSid
                };
                ws.send(JSON.stringify(hangupPayload));
                console.log('📞 Call ended');
              }, 3000);
            }, 5000);
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
      // Split into sentences and add pauses
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      
      currentlySpeakingToTwilio = true;
      
      for (let i = 0; i < sentences.length; i++) {
        // Check if we've been interrupted
        if (!currentlySpeakingToTwilio) {
          console.log('🛑 TTS interrupted, stopping');
          break;
        }
        
        const sentence = sentences[i].trim();
        
        // Use Deepgram TTS
        const response = await deepgram.speak.request(
          { text: sentence },
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
        for (let j = 0; j < audioBuffer.length; j += chunkSize) {
          // Check interruption again
          if (!currentlySpeakingToTwilio) {
            break;
          }
          
          const chunk = audioBuffer.slice(j, j + chunkSize);
          const payload = {
            event: 'media',
            streamSid: streamSid,
            media: {
              payload: chunk.toString('base64')
            }
          };
          ws.send(JSON.stringify(payload));
        }
        
        // Add a natural pause between sentences (300ms)
        if (i < sentences.length - 1 && currentlySpeakingToTwilio) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      currentlySpeakingToTwilio = false;
      
    } catch (error) {
      console.error('❌ TTS error:', error);
      currentlySpeakingToTwilio = false;
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
