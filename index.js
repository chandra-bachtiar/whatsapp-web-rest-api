import 'dotenv/config';
import Fastify from "fastify";
import fastifyCors from '@fastify/cors';
import whatsappWeb from "whatsapp-web.js";
import QRCode from "qrcode";

const { Client, LocalAuth } = whatsappWeb;
const fastify = Fastify({ logger: true });
fastify.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST"],
});

let qrCodeData = null;
let whatsapp = {
    status: false,
    number: null,
    from: null,
}

// Middleware pengecekan API Key
const apiKeyCheck = async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.APIKEY) {
        reply.code(401).send({ error: "Unauthorized - API Key tidak valid" });
        throw new Error('Unauthorized');
    }
};

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp-session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    }
});

client.on("qr", async (qr) => {
    qrCodeData = await QRCode.toDataURL(qr);
    console.log("New QR Code generated");
});

client.on("ready", () => {
    console.log("WhatsApp Bot Ready!");
    qrCodeData = null;
    whatsapp.status = true;
    whatsapp.number = client.info.wid.user;
    whatsapp.from = new Date();
});

client.on("disconnected", (reason) => {
    console.log("WhatsApp Bot Disconnected", reason);
    whatsapp.status = false;
    whatsapp.number = null;
    whatsapp.from = null;
});

client.on("message", async (message) => {
    if (message.body === "life-check") {
        await message.reply("Im here!");
    }
});

// Endpoint QR dengan auth
fastify.get("/qr", {
    preHandler: apiKeyCheck,
    handler: async (request, reply) => {
        if (!qrCodeData) {
            return reply.code(400).send({ error: "QR Code belum tersedia atau sudah kadaluarsa" });
        }
        return reply.send({ qr: qrCodeData });
    }
});

// Status of the bot
fastify.get("/status", {
    handler: async (request, reply) => {
        return reply.send({ whatsapp });
    }
});

//Logout the bot
fastify.get("/logout", {
    handler: async (request, reply) => {
        await client.logout();
        return reply.send({ status: "Logged Out Successfully" });
    }
});

// Endpoint Send dengan auth
fastify.post("/send", {
    preHandler: apiKeyCheck,
    handler: async (request, reply) => {
        console.log(request.body);
        const { number, message } = request.body;
        if (!number || !message) {
            return reply.code(400).send({ error: "Number dan message harus diisi" });
        }

        try {
            const chatId = number.includes("@c.us") ? number : `${number}@c.us`;
            console.log(chatId, message);
            await client.sendMessage(chatId, message);
            reply.send({ success: true, message: "Pesan terkirim" });
        } catch (error) {
            reply.code(500).send({ error: "Gagal mengirim pesan", details: error.message });
        }
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: "0.0.0.0" });
        await client.initialize();
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();