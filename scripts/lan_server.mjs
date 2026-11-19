/**
 * Zero-dependency Off-Grid LAN Server for Command & Conquer: Generals HTML5 Edition.
 * Serves the game over HTTP AND runs a built-in WebSocket room relay on the same port
 * so single-player and LAN multiplayer work 100% offline with zero external dependencies.
 *
 * Usage:
 *   npm run lan
 *   node scripts/lan_server.mjs --port=8080
 *   node scripts/lan_server.mjs --no-build
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='));
const PORT = Math.max(1, Math.min(65535, parseInt(portArg ? portArg.split('=')[1] : (process.env.PORT || '8080'), 10) || 8080));
const skipBuild = args.includes('--no-build');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

// 1. Ensure index.html & assets/data bundles exist before serving
const indexPath = path.join(rootDir, 'index.html');
const dataDir = path.join(rootDir, 'assets', 'data');
const needsBuild = !fs.existsSync(indexPath) || !fs.existsSync(path.join(dataDir, '02b_w3d_models.js'));
if (!skipBuild && (needsBuild || args.includes('--rebuild'))) {
    console.log('Building game bundle before starting LAN server...');
    execFileSync(process.execPath, [path.join(rootDir, 'build.js')], { cwd: rootDir, stdio: 'inherit' });
}

// 2. Minimal RFC 6455 WebSocket framing helpers (zero external dependencies)
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_WS_PAYLOAD = 2 * 1024 * 1024;

function encodeWsFrame(payloadBuf, opcode = 0x1) {
    const len = payloadBuf.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode;
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payloadBuf]);
}

function sendWsJson(client, obj) {
    if (!client || client.closed || !client.socket || client.socket.destroyed) return;
    try {
        const buf = Buffer.from(JSON.stringify(obj), 'utf8');
        client.socket.write(encodeWsFrame(buf, 0x1));
    } catch (_) {
        // Ignore broken pipe on closing client
    }
}

// Room registry: roomCode -> { host: client, guest: client | null }
const rooms = new Map();

function detachClient(client) {
    if (client.closed) return;
    client.closed = true;
    const roomCode = client.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.host === client) {
        if (room.guest && !room.guest.closed) {
            sendWsJson(room.guest, { _lan: 'peer_disconnected', reason: 'host_left' });
            room.guest.roomCode = null;
        }
        rooms.delete(roomCode);
    } else if (room.guest === client) {
        room.guest = null;
        if (room.host && !room.host.closed) {
            sendWsJson(room.host, { _lan: 'peer_disconnected', reason: 'guest_left' });
        }
    }
}

function handleWsMessage(client, text) {
    let msg;
    try {
        msg = JSON.parse(text);
    } catch (_) {
        return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg._lan === 'host') {
        const roomCode = String(msg.room || '').trim().toUpperCase();
        if (!roomCode || roomCode.length > 32) {
            sendWsJson(client, { _lan: 'error', message: 'Invalid room code.' });
            return;
        }
        if (rooms.has(roomCode)) {
            sendWsJson(client, { _lan: 'error', code: 'unavailable-id', message: 'Room code already in use.' });
            return;
        }
        if (rooms.size >= 64) {
            sendWsJson(client, { _lan: 'error', message: 'LAN server room limit reached.' });
            return;
        }
        client.roomCode = roomCode;
        client.role = 'host';
        rooms.set(roomCode, {
            host: client,
            guest: null,
            hostFaction: String(msg.hostFaction || 'usa').slice(0, 16),
            mapName: String(msg.mapName || 'Tournament Desert').slice(0, 48),
            createdAt: Date.now()
        });
        sendWsJson(client, { _lan: 'hosted', room: roomCode });
        return;
    }

    if (msg._lan === 'update_meta') {
        const room = client.roomCode ? rooms.get(client.roomCode) : null;
        if (room && room.host === client) {
            if (msg.hostFaction) room.hostFaction = String(msg.hostFaction).slice(0, 16);
            if (msg.mapName) room.mapName = String(msg.mapName).slice(0, 48);
        }
        return;
    }

    if (msg._lan === 'join') {
        const roomCode = String(msg.room || '').trim().toUpperCase();
        const room = rooms.get(roomCode);
        if (!room || !room.host || room.host.closed) {
            sendWsJson(client, { _lan: 'error', message: `Room ${roomCode} not found on LAN server.` });
            return;
        }
        if (room.guest && !room.guest.closed) {
            sendWsJson(client, { _lan: 'error', message: `Room ${roomCode} is already full.` });
            return;
        }
        client.roomCode = roomCode;
        client.role = 'guest';
        room.guest = client;
        sendWsJson(client, { _lan: 'joined', room: roomCode });
        sendWsJson(room.host, { _lan: 'peer_connected', room: roomCode });
        return;
    }

    if (msg._lan === 'data') {
        const room = client.roomCode ? rooms.get(client.roomCode) : null;
        if (!room) return;
        const peer = (room.host === client) ? room.guest : room.host;
        if (peer && !peer.closed) {
            sendWsJson(peer, { _lan: 'data', payload: msg.payload });
        }
    }
}

function attachWebSocket(socket) {
    const client = {
        socket,
        roomCode: null,
        role: null,
        closed: false,
        buf: Buffer.alloc(0),
        fragChunks: [],
        fragOpcode: 0
    };

    socket.on('data', (chunk) => {
        client.buf = Buffer.concat([client.buf, chunk]);
        while (client.buf.length >= 2) {
            const b0 = client.buf[0];
            const b1 = client.buf[1];
            const fin = (b0 & 0x80) !== 0;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let payloadLen = b1 & 0x7f;
            let offset = 2;

            if (payloadLen === 126) {
                if (client.buf.length < 4) return;
                payloadLen = client.buf.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (client.buf.length < 10) return;
                const bigLen = client.buf.readBigUInt64BE(2);
                if (bigLen > BigInt(MAX_WS_PAYLOAD)) {
                    socket.destroy();
                    return;
                }
                payloadLen = Number(bigLen);
                offset = 10;
            }

            if (payloadLen > MAX_WS_PAYLOAD) {
                socket.destroy();
                return;
            }

            const maskLen = masked ? 4 : 0;
            if (client.buf.length < offset + maskLen + payloadLen) return;

            const maskKey = masked ? client.buf.subarray(offset, offset + 4) : null;
            const payload = Buffer.from(client.buf.subarray(offset + maskLen, offset + maskLen + payloadLen));
            client.buf = client.buf.subarray(offset + maskLen + payloadLen);

            if (masked && maskKey) {
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= maskKey[i & 3];
                }
            }

            if (opcode === 0x8) {
                // Close frame
                try { socket.write(encodeWsFrame(Buffer.alloc(0), 0x8)); } catch (_) {}
                socket.end();
                detachClient(client);
                return;
            } else if (opcode === 0x9) {
                // Ping -> Pong
                try { socket.write(encodeWsFrame(payload, 0xA)); } catch (_) {}
            } else if (opcode === 0xA) {
                // Pong
            } else if (opcode === 0x1 || opcode === 0x0) {
                if (opcode === 0x1) {
                    client.fragChunks = [payload];
                    client.fragOpcode = 0x1;
                } else {
                    client.fragChunks.push(payload);
                }
                if (fin && client.fragOpcode === 0x1) {
                    const full = Buffer.concat(client.fragChunks).toString('utf8');
                    client.fragChunks = [];
                    client.fragOpcode = 0;
                    handleWsMessage(client, full);
                }
            }
        }
    });

    socket.on('close', () => detachClient(client));
    socket.on('error', () => detachClient(client));
}

// 3. HTTP static file server + /api/lan-status discovery endpoint
const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let reqPath = decodeURIComponent(urlObj.pathname);

    if (reqPath === '/api/lan-status') {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ ok: true, mode: 'lan', rooms: rooms.size, wsPath: '/lan-ws' }));
        return;
    }

    if (reqPath === '/api/lan-rooms') {
        const list = [];
        for (const [code, room] of rooms.entries()) {
            if (!room.host || room.host.closed) continue;
            const hasGuest = Boolean(room.guest && !room.guest.closed);
            list.push({
                room: code,
                hostFaction: room.hostFaction || 'usa',
                mapName: room.mapName || 'Tournament Desert',
                players: hasGuest ? 2 : 1,
                maxPlayers: 2,
                open: !hasGuest
            });
        }
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ ok: true, rooms: list }));
        return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.resolve(rootDir, '.' + reqPath);
    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const headers = { 'Content-Type': mime };
        if (ext === '.html') {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        } else {
            headers['Cache-Control'] = 'public, max-age=3600';
        }
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
});

server.on('upgrade', (req, socket) => {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname !== '/lan-ws') {
        socket.destroy();
        return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    attachWebSocket(socket);
});

function getLanAddresses() {
    const ifaces = os.networkInterfaces();
    const out = [];
    for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
            if (info.family === 'IPv4' && !info.internal) {
                out.push({ name, address: info.address });
            }
        }
    }
    return out;
}

server.listen(PORT, '0.0.0.0', () => {
    const lanAddrs = getLanAddresses();
    console.log('');
    console.log('================================================================');
    console.log('  C&C: Generals HTML5 — Off-Grid LAN Server Running!');
    console.log('================================================================');
    console.log(`  Local PC:      http://localhost:${PORT}`);
    if (lanAddrs.length > 0) {
        lanAddrs.forEach(a => console.log(`  LAN Players:   http://${a.address}:${PORT}  (${a.name})`));
    }
    console.log('  Multiplayer:   Built-in LAN WebSocket Relay active (/lan-ws)');
    console.log('  Internet:      NOT required (100% off-grid)');
    console.log('================================================================');
    console.log('  Press Ctrl+C to stop the server.');
    console.log('');
});
