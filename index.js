import 'dotenv/config';
import Fastify from "fastify";
import fastifyCors from '@fastify/cors';
import whatsappWeb from "whatsapp-web.js";
import QRCode from "qrcode";
import qrcode from "qrcode-terminal";
import { google } from "googleapis";
import cron from "node-cron";

const { Client, LocalAuth } = whatsappWeb;
const fastify = Fastify({ logger: true });
fastify.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST"],
});

let qrCodeData = null;
let cronJob;
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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" || '/usr/bin/chromium-browser'
    }
});

client.on("qr", async (qr) => {
    qrCodeData = await QRCode.toDataURL(qr);
    qrcode.generate(qr, { small: true });
    console.log("New QR Code generated");
});

client.on('initialized', () => {
    console.log('WhatsApp Bot Initialized');
});

client.on("ready", () => {
    console.log("WhatsApp Bot Ready!");
    qrCodeData = null;
    whatsapp.status = true;
    whatsapp.number = client.info.wid.user;
    whatsapp.from = new Date();

    // Start cron job
    startCronJob();
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

    if (message.body === "start-cron-job") {
        await message.reply(startCronJob());
    }

    if (message.body === "stop-cron-job") {
        await message.reply(stopCronJob());
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
        const { number, message } = request.body;
        if (!number || !message) {
            return reply.code(400).send({ error: "Number dan message harus diisi" });
        }

        try {
            const chatId = number.includes("@c.us") ? number : `${number}@c.us`;
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


async function getDataFromSheet() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: 'credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const sheetInfo = await googleSheets.spreadsheets.get({
            spreadsheetId,
        });

        const firstSheet = sheetInfo.data.sheets[0].properties.title;

        const response = await googleSheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${firstSheet}!F2:G4`,
        });

        return response.data.values[0][0];
    } catch (error) {
        console.error(error);
    }
}

// Fungsi untuk mulai cron job
function startCronJob() {
    if (cronJob) {
        return 'Cron job sudah jalan bro!';
    }

    cronJob = cron.schedule('*/30 * * * * *', async () => { // Tiap 5 detik
        console.log('Ambil data sheet...');
        const data = await getDataFromSheet();
        const isDefisit = Number(data.replace('Rp', '').replace(/\./g, '')) < 0;
        let groupName = isDefisit ? `🥲 ${data}` : `😍 ${data}`

        await changeGroupName('120363369867361123@g.us', groupName);
        console.log('Data sheet berhasil diambil!');
    });

    return 'Cron job buat ambil data spreadsheet udah jalan!';
}

// Fungsi untuk stop cron job
function stopCronJob() {
    if (!cronJob) {
        return 'Cron job belum jalan bro!';
    }

    cronJob.stop();
    cronJob = null;
    return 'Cron job udah distop!';
}

async function changeGroupName(groupId, newName) {
    try {
        const chat = await client.getChatById(groupId);
        await chat.setSubject(newName);
        console.log('Nama group berhasil diubah!');
    } catch (error) {
        console.error(error);
        return 'Gagal mengubah nama group!';
    }
}

start();