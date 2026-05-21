const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Configuration
const CALENDLY_TOKEN = process.env.CALENDLY_TOKEN;
const CALENDLY_EVENT_URI = process.env.CALENDLY_EVENT_URI; // Will be set from API
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// System prompt for the AI agent
const SYSTEM_PROMPT = `You are the intake specialist for JAllapeños Forge, a business efficiency consulting firm.

YOUR ROLE:
- Determine if the caller is a new lead or existing customer
- For NEW LEADS: qualify them and schedule a consultation
- For EXISTING CUSTOMERS: verify their identity and offer to transfer to a live person

CALL FLOW FOR NEW LEADS:
1. Greet warmly: "Thanks for calling JAllapeños Forge. I'm the AI assistant. How can I help you today?"
2. Determine their need - are they interested in an efficiency assessment?
3. If yes, ask qualifying questions:
   - Business name?
   - What industry?
   - What's the main thing slowing them down or costing unnecessary time?
   - How many employees?
4. If they seem like a fit (any business with repetitive tasks), offer to schedule a 30-minute consultation
5. Use the book_appointment tool to schedule

CALL FLOW FOR EXISTING CUSTOMERS:
1. Ask for their name and which service they used
2. Offer to transfer them to a live person: "Let me connect you with the team."
3. Use transfer_to_human tool

TONE:
- Professional but approachable
- Efficient without being rushed
- Genuinely helpful

IMPORTANT:
- Keep responses concise (2-3 sentences max)
- Don't ask multiple questions at once
- If they're unsure or hesitant, acknowledge it and offer the consultation anyway
- Never promise specific results, just offer to assess their situation`;

// Claude function definitions for Calendly booking
const CLAUDE_TOOLS = [
  {
    name: "book_appointment",
    description: "Book a 30-minute efficiency assessment consultation in the calendar. Call this when the caller wants to schedule.",
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
        notes: {
          type: "string",
          description: "Business name, industry, and main challenge/pain point mentioned"
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

// Get Calendly event type URI
async function getCalendlyEventURI() {
  try {
    const response = await axios.get('https://api.calendly.com/event_types', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Find the 30min event
    const eventType = response.data.collection.find(et => 
      et.slug === '30min' || et.name.includes('30')
    );
    
    return eventType ? eventType.uri : null;
  } catch (error) {
    console.error('Error fetching Calendly event types:', error.message);
    return null;
  }
}

// Book appointment via Calendly
async function bookCalendlyAppointment(name, email, notes) {
  try {
    // First, get available times
    const eventURI = await getCalendlyEventURI();
    if (!eventURI) {
      throw new Error('Could not find Calendly event type');
    }

    // Get user URI
    const userResponse = await axios.get('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const userURI = userResponse.data.resource.uri;

    // Create invitee
    // Note: Calendly API v2 requires getting available times first, then creating a scheduled event
    // For simplicity in this demo, we'll return a scheduling link instead of auto-booking
    const schedulingLink = `https://calendly.com/telecomjeff/30min?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
    
    return {
      success: true,
      link: schedulingLink,
      message: `I've prepared a booking link for you. You'll receive it via text message after this call, or you can visit calendly.com/telecomjeff/30min to choose your preferred time.`
    };
  } catch (error) {
    console.error('Calendly booking error:', error.response?.data || error.message);
    return {
      success: false,
      message: "I'm having trouble accessing the calendar right now. Let me take your information and someone will call you back within 2 hours to schedule."
    };
  }
}

// Main incoming call handler
app.post('/incoming-call', async (req, res) => {
  console.log('Incoming call from:', req.body.From);
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Start Twilio Voice Intelligence session
  const connect = twiml.connect();
  const stream = connect.stream({
    url: `wss://${req.headers.host}/media-stream`
  });

  // For now, use a simpler approach with Gather and basic TwiML
  // Twilio Voice Intelligence integration would require WebSocket streaming
  // Let's start with a basic IVR that we can upgrade
  
  twiml.say({
    voice: 'Polly.Joanna'
  }, 'Thanks for calling JAllapeños Forge. For a free efficiency assessment, press 1. If you\'re an existing customer, press 2.');
  
  const gather = twiml.gather({
    numDigits: 1,
    action: '/handle-selection'
  });
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle menu selection
app.post('/handle-selection', (req, res) => {
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();
  
  if (digit === '1') {
    // New lead - collect information
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Great! I\'ll collect some quick information and get you scheduled. Please stay on the line.');
    
    // In production, this would trigger the AI conversation
    // For now, redirect to voicemail/callback
    twiml.say('Please leave your name, business name, and phone number after the beep, and we\'ll call you back within 2 hours to schedule your assessment.');
    twiml.record({
      maxLength: 120,
      action: '/handle-recording'
    });
    
  } else if (digit === '2') {
    // Existing customer - transfer
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'One moment, I\'ll connect you with the team.');
    
    // Dial the business line (you'll need to set this)
    // twiml.dial(process.env.BUSINESS_PHONE);
    twiml.say('Our team is currently assisting other clients. Please leave a message and we\'ll call you back shortly.');
    twiml.record({
      maxLength: 120,
      action: '/handle-recording'
    });
  } else {
    twiml.say('I didn\'t understand that selection.');
    twiml.redirect('/incoming-call');
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle recording completion
app.post('/handle-recording', (req, res) => {
  console.log('Recording received:', req.body.RecordingUrl);
  
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({
    voice: 'Polly.Joanna'
  }, 'Thank you for your message. We\'ll be in touch soon. Have a great day!');
  twiml.hangup();
  
  // TODO: Send notification email/SMS with recording link
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'JAllapeños Phone Agent',
    status: 'running',
    version: '1.0.0'
  });
});

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 JAllapeños Phone Agent running on port ${PORT}`);
  console.log(`📞 Ready to handle calls`);
});
