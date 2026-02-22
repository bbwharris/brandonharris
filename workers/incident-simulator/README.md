# Incident Response Simulator

An interactive simulation of a critical infrastructure incident response scenario, built with Cloudflare Workers and the Agents SDK.

## Overview

This simulator puts you in the role of an Incident Commander responding to a P0 kernel vulnerability (CVE-2024-8765) affecting 847 edge servers across 5 global regions. You'll diagnose the issue, assess the blast radius, and coordinate the patching response.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (agents.brandon-harris.com/incident)     │
│  ├── IncidentAgent (Durable Object)                         │
│  │   ├── WebSocket connections for real-time updates       │
│  │   ├── Simulation tick loop (time acceleration)          │
│  │   ├── SQLite-backed state persistence                   │
│  │   └── Workers AI integration (Llama 3.1)                │
│  └── React SPA (served from Worker)                         │
│      ├── Terminal interface (commands)                     │
│      ├── Dashboard (metrics visualization)                 │
│      └── Chat (AI assistant)                               │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

- **Cloudflare Workers**: Edge computing platform
- **Agents SDK**: Stateful WebSocket agents with Durable Objects
- **Workers AI**: Llama 3.1 8B for the AI assistant
- **SQLite**: State persistence via Durable Objects
- **React 18**: Frontend UI
- **TypeScript**: Type safety throughout

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (for deployment)

### Installation

```bash
# Navigate to the project
cd workers/incident-simulator

# Install worker dependencies
npm install

# Install UI dependencies
cd ui && npm install && cd ..
```

## Common Development Tasks

### Making UI Changes

For rapid UI development with hot reload:

```bash
# Terminal 1: Keep Worker running
cd workers/incident-simulator
npm run dev

# Terminal 2: Edit UI files
cd workers/incident-simulator/ui
npm run dev
# Edit files in ui/src/ - changes appear instantly
```

### Making Backend Changes

When editing Agent logic or adding commands:

```bash
# Terminal 1: Worker will auto-reload on changes
cd workers/incident-simulator
npm run dev
# Edit files in src/ - Worker restarts automatically

# Terminal 2: UI for testing
cd workers/incident-simulator/ui
npm run dev
```

### Testing WebSocket Connections

```bash
# Test WebSocket endpoint manually
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:8787/agents/incident-agent/session
```

### Checking Logs

```bash
# View Worker logs in real-time
tail -f /tmp/wrangler.log

# View UI dev server logs
tail -f /tmp/ui.log
```

### Clean Restart

If things get stuck:

```bash
# Kill all processes
pkill -f wrangler
pkill -f vite

# Clear any cached state
rm -rf .wrangler/state

# Start fresh
npm run dev
```

### Running Locally

The simulator requires **two processes** running simultaneously:
- **Worker** (`http://localhost:8787`): Backend API, WebSocket server, and AI integration
- **UI Dev Server** (`http://localhost:3000`): React frontend with hot reload

The UI automatically connects to the Worker's WebSocket endpoint.

#### Quick Start

Open **two separate terminal windows**:

**Terminal 1 - Start the Worker:**
```bash
cd workers/incident-simulator
npm run dev
```

You should see: `Ready on http://localhost:8787`

**Terminal 2 - Start the UI:**
```bash
cd workers/incident-simulator/ui
npm run dev
```

You should see: `Local: http://localhost:3000/`

**Open your browser:** Navigate to `http://localhost:3000`

#### Verification

Once both servers are running:

1. **Worker logs** should show: `Client connected: xxx` when you load the UI
2. **UI header** should display: `🟢 Connected`
3. **Type `status`** in the terminal - you should see the incident overview

#### Stopping the Servers

To stop both servers:

```bash
# Stop the Worker
pkill -f wrangler

# Stop the UI dev server  
pkill -f vite
```

Or press `Ctrl+C` in each terminal window.

#### Alternative: Single Server Mode (Production Build)

If you don't need hot reload and want to run just one server:

```bash
# Build the UI into static files
cd workers/incident-simulator/ui
npm run build

# Run Worker (serves both API and static UI)
cd workers/incident-simulator
npm run dev
```

Access at `http://localhost:8787`

## Commands

Once the simulator is running, you can use these commands in the terminal:

### Status & Monitoring
- `status` - Show current incident status and metrics
- `metrics [service]` - View metrics (overview, edge, kernel, security)
- `logs <service> [timeframe]` - View logs (edge, kernel, security, all)
- `regions` - Show status of all regions

### Response Actions
- `patch <region>` - Initiate kernel patch (us-east, us-west, eu-west, eu-central, apac)
- `rollback <region>` - Rollback patch in a region
- `alert <team> <msg>` - Send alert (sre, security, leadership, customers, all)

### Assistance
- `hint` - Get contextual guidance based on current phase
- `query <question>` - Ask the on-call engineer AI assistant
- `help` - Show all available commands
- `reset` - Restart the simulation

### Examples

```bash
$ metrics edge
$ logs kernel 60
$ patch us-east
$ alert sre "Patch initiated in us-east"
$ query "What's the CVSS score for this CVE?"
```

## Incident Scenario

**CVE-2024-8765**: Linux kernel privilege escalation vulnerability

- **CVSS Score**: 9.8 (Critical)
- **Affected Kernels**: 5.15.x through 6.6.x
- **Affected Servers**: 847 edge servers
- **Traffic at Risk**: ~12% of global traffic
- **Regions**: us-east, us-west, eu-west, eu-central, apac

Your mission is to:
1. **Triage**: Assess severity and impact
2. **Investigate**: Query logs and metrics to understand the vulnerability
3. **Respond**: Execute patches region by region
4. **Resolve**: Confirm all systems are stable

## AI Assistant

The on-call engineer AI is powered by Llama 3.1 running on Cloudflare Workers AI. It:
- Knows the current incident state and CVE details
- Provides SRE-style calm, technical guidance
- Answers questions about the incident and response procedures
- Offers suggestions based on the current phase

## File Structure

```
workers/incident-simulator/
├── src/
│   ├── agent.ts          # Main IncidentAgent class
│   ├── tools.ts          # Command implementations
│   ├── scenario.ts       # Incident definition and logs
│   ├── types.ts          # TypeScript interfaces
│   ├── index.ts          # Worker entry point
│   └── env.d.ts          # Environment type definitions
├── ui/
│   ├── src/
│   │   ├── App.tsx       # Main React component
│   │   ├── Terminal.tsx  # Terminal interface
│   │   ├── Dashboard.tsx # Metrics dashboard
│   │   ├── Chat.tsx      # AI chat interface
│   │   └── main.tsx      # React entry point
│   ├── index.html        # HTML template
│   └── vite.config.ts    # Vite configuration
├── wrangler.toml         # Worker configuration
├── package.json          # Worker dependencies
└── README.md            # This file
```

## Deployment

### Prerequisites

1. Cloudflare account
2. Wrangler CLI installed: `npm install -g wrangler`
3. Authenticated: `npx wrangler login`
4. Domain (e.g., brandon-harris.com) added to Cloudflare DNS

### Pre-Deployment Setup

Before deploying, you need to set up the subdomain:

#### Step 1: Add DNS Record (Manual)

Go to **Cloudflare Dashboard** → **DNS** → **Add Record**:

**Option A - CNAME (Recommended for Workers):**
- Type: `CNAME`
- Name: `agents`
- Target: `incident-simulator` (leave as just the Worker name)
- Proxy status: Enabled (orange cloud)

**Option B - A Record:**
- Type: `A`
- Name: `agents`
- IPv4 address: `192.0.2.1` (placeholder, will be updated by Worker)
- Proxy status: Enabled (orange cloud)

#### Step 2: Deploy the Worker

```bash
# Build the UI production bundle
cd workers/incident-simulator/ui
npm run build

# Deploy (creates Worker, Durable Objects, AI binding)
cd workers/incident-simulator
npx wrangler deploy
```

The deploy command will:
- ✅ Upload Worker code
- ✅ Create Durable Objects namespace
- ✅ Apply SQLite migration
- ✅ Set up Workers AI binding
- ✅ Configure static asset serving

#### Step 3: Configure Custom Domain (Manual)

After deploy, connect the subdomain:

**Cloudflare Dashboard** → **Workers & Pages** → **incident-simulator** → **Settings** → **Triggers**:

1. Click **Add Custom Domain**
2. Enter: `agents.brandon-harris.com`
3. Click **Add Domain**

Wait 30-60 seconds for SSL certificate provisioning.

#### Step 4: Verify Deployment

```bash
# Test the API
curl https://agents.brandon-harris.com

# Test WebSocket (should return 101 Switching Protocols)
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://agents.brandon-harris.com/agents/incident-agent/session
```

### Alternative: Using Routes (Instead of Custom Domain)

If you prefer using routes instead of Custom Domains, uncomment in `wrangler.toml`:

```toml
[[routes]]
pattern = "agents.brandon-harris.com/incident*"
zone_name = "brandon-harris.com"
custom_domain = true
```

Then deploy again: `npx wrangler deploy`

**Note**: Custom Domains are preferred over routes for new projects as they provide better performance and automatic SSL.

### Hugo Integration

The simulator is embedded in the Hugo site via an iframe:

```html
<iframe 
  src="https://agents.brandon-harris.com/incident" 
  width="100%" 
  height="800px"
></iframe>
```

## Configuration

### wrangler.toml

```toml
name = "incident-simulator"
main = "src/index.ts"
compatibility_date = "2024-02-01"

[[durable_objects.bindings]]
name = "IncidentAgent"
class_name = "IncidentAgent"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["IncidentAgent"]

[ai]
binding = "AI"
```

### Customization

You can customize the simulation by editing:

- `src/scenario.ts`: CVE details, regions, log messages, hints
- `src/agent.ts`: Simulation parameters (time acceleration, tick interval)
- `src/tools.ts`: Command behavior and responses

## Troubleshooting

### WebSocket Connection Issues

If the UI shows "🔴 Disconnected":

1. **Check both servers are running:**
   ```bash
   curl http://localhost:8787  # Should return API server message
   curl http://localhost:3000  # Should return HTML
   ```

2. **Verify Worker started successfully:**
   - Look for `Ready on http://localhost:8787` in logs
   - Check for `⎔ Starting local server...`

3. **Common errors:**
   - `500 Internal Server Error` on WebSocket: Worker crashed, check logs
   - `Web Socket request did not return status 101`: Agent class error, check `agent.ts`
   - Connection refused: Worker isn't running on port 8787

4. **Port conflicts:**
   If ports 8787 or 3000 are in use, kill existing processes:
   ```bash
   lsof -ti:8787 | xargs kill -9
   lsof -ti:3000 | xargs kill -9
   ```

### Build Errors

If UI build fails:
```bash
cd ui
rm -rf node_modules package-lock.json
npm install
npm run build
```

If Worker build fails with "No matching export":
```bash
# Reinstall dependencies
cd workers/incident-simulator
rm -rf node_modules package-lock.json
npm install
```

### Workers AI Charges

Note: Even in local development, using Workers AI (Llama 3.1) incurs charges on your Cloudflare account. The AI assistant makes API calls for each chat message.

### State Not Persisting

The simulation uses SQLite via Durable Objects. Ensure:
1. `new_sqlite_classes` migration is applied in wrangler.toml
2. Durable Objects are properly bound
3. You're using a recent Wrangler version (3.x+)

## Learn More

- [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [CISA Secure-By-Design Pledge](https://www.cisa.gov/securebydesign)

## License

MIT - See LICENSE file in repository root

## Author

Brandon Harris - Guiding AI
