---
title: "Incident Response Simulator"
description: "Interactive simulation of a critical infrastructure incident"
layout: single
url: /incident-simulator/
---

## 🚨 Experience Incident Response Firsthand

Step into the role of an Incident Commander during a critical P0 incident. This interactive simulation puts you in charge of responding to a kernel vulnerability affecting hundreds of edge servers and millions of requests per second.

### What You'll Experience

- **Real-time Decision Making**: Balance speed vs. caution as you diagnose and respond
- **Systematic Investigation**: Query metrics, review logs, and assess the blast radius
- **Coordinated Response**: Execute kernel patches across global regions while monitoring for issues
- **AI Assistant**: Get guidance from an experienced SRE who knows the system

### Based on Real Experience

This simulation is inspired by the automated kernel patching processes and incident response protocols we use at Cloudflare. It demonstrates the principles outlined in my [CISA Secure-By-Design blog post](https://blog.cloudflare.com/cloudflare-delivers-on-commitment-to-cisa/).

---

<div id="simulator-container" style="width: 100%; height: 800px; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; margin: 20px 0;">
  <iframe 
    id="simulator-iframe"
    src="https://agents.brandon-harris.com/incident" 
    style="width: 100%; height: 100%; border: none;"
    allow="fullscreen"
    title="Incident Response Simulator"
  ></iframe>
</div>

<noscript>
  <div style="padding: 40px; text-align: center; background: #161b22; border-radius: 8px;">
    <p style="color: #da3633; font-weight: 600;">⚠️ JavaScript Required</p>
    <p style="color: #8b949e;">The Incident Response Simulator requires JavaScript to run. Please enable JavaScript in your browser to try the simulation.</p>
  </div>
</noscript>

---

### Quick Start Guide

Once the simulator loads, you'll be connected to a live simulation. Here are the essential commands to get started:

**Check Status**
```
$ status
```

**View Metrics**
```
$ metrics
$ metrics edge
$ metrics kernel
```

**Query Logs**
```
$ logs security 30
$ logs kernel 60
```

**Execute Patches**
```
$ patch us-east
$ patch eu-west
```

**Get Help**
```
$ help
$ hint
```

**Ask the On-Call Engineer**
```
query What's the CVSS score for this CVE?
```

---

### Learning Objectives

This simulation helps develop:

- **Situational Awareness**: Quickly assess the scope and severity of an incident
- **Systematic Debugging**: Methodically investigate root causes
- **Risk Management**: Balance remediation speed against potential complications
- **Communication**: Keep stakeholders informed throughout the response
- **Technical Depth**: Understand kernel patching at scale

### Technology Stack

This simulator is built with:
- **Cloudflare Workers**: Edge computing platform
- **Cloudflare Agents SDK**: Stateful WebSocket connections with Durable Objects
- **Workers AI**: Llama 3.1 for the AI assistant
- **React**: Interactive terminal-style UI
- **SQLite**: Persistent state management

### Source Code

The simulator is open source. You can view the implementation on [GitHub](https://github.com/bbwharris/brandonharris/tree/main/workers/incident-simulator).

---

**Ready to test your incident response skills? The simulation is running above. Good luck, and remember: the edge is depending on you.**
