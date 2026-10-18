# Vincent web

A lightweight web interface for a locally hosted Gemma model, Breeze speech and
Parakeet transcription. This repository contains only the public interface and
the current public gateway address. It contains no model weights, owner settings,
API keys, private conversations, memory or uploaded documents.

The Mac-hosted gateway supports:

- `GET /status`
- `GET /v1/models`
- `POST /v1/chat/completions` (text messages; `stream:false`)
- `POST /api/files/extract` (filename and base64 content)
- `WS /ws` (staged chat, transcription and speech audio events)

The website discovers the current HTTPS gateway from `runtime.json` in this
repository. It shows offline status when the Mac is unavailable. The Mac must be
awake, logged in and online. A login service updates this address when the
temporary HTTPS tunnel changes. Quick Tunnels have no uptime guarantee.

Anyone with the link can use the isolated public interface. It has no access to
the owner's private desktop conversation, memory, settings or terminal tools.
The owner can separately connect a browser using a private pairing link from the
desktop app. Paired owner sessions share the complete local history archive and
can export it. The private pairing key is never published to this repository.
Conversation text is stored in the visitor's browser. Uploaded files are extracted
on the Mac; document excerpts are passed to the local model for answers. Requests
travel through Cloudflare's HTTPS tunnel. There is no external model API.
