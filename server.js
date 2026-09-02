const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statische Dateien (deine HTML) aus dem Ordner "public" ausliefern
app.use(express.static(path.join(__dirname, 'public')));

// === KONFIGURATION ===
const ADMIN_PIN = "0123"; // 🔒 DEIN GEHEIMER PIN (Hier ändern)
const DB_FILE = path.join(__dirname, 'database.json');

// Standard-Daten
let dbData = {
    people: [
        { name: "Limmel", score: 0 },
        { name: "Killianmappellia", score: 0 },
        { name: "Otto", score: 0 },
        { name: "Ande", score: 0 },
        { name: "Lelonard", score: 0 }
    ],
    rewards: [
        { points: 5, text: "Kaffee geht auf dich" },
        { points: 10, text: "Auswahl des nächsten Films" },
        { points: 20, text: "Essen wird spendiert" }
    ]
};

// Datenbank laden (falls vorhanden)
if (fs.existsSync(DB_FILE)) {
    const rawData = fs.readFileSync(DB_FILE);
    dbData = JSON.parse(rawData);
}

// Datenbank speichern
function saveData() {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
}

// Socket.IO für Live-Verbindungen
io.on('connection', (socket) => {
    // 1. Beim Verbinden sofort aktuelle Daten senden
    socket.emit('updateState', dbData);

    // 2. Login überprüfen
    socket.on('login', (pin) => {
        if (pin === ADMIN_PIN) {
            socket.isAdmin = true;
            socket.emit('loginSuccess');
        } else {
            socket.emit('loginFailed');
        }
    });

    // 3. Punktestand ändern
    socket.on('changeScore', (data) => {
        if (!socket.isAdmin) return; // Sicherheit: Nur Admins
        const { index, delta } = data;
        if (dbData.people[index]) {
            dbData.people[index].score += delta;
            saveData();
            io.emit('updateState', dbData); // Allen Clients das Update schicken
        }
    });

    // 4. Person hinzufügen
    socket.on('addPerson', (name) => {
        if (!socket.isAdmin) return;
        if (name && name.trim() !== "") {
            dbData.people.push({ name: name.trim(), score: 0 });
            saveData();
            io.emit('updateState', dbData);
        }
    });

    // 5. Person löschen
    socket.on('deletePerson', (index) => {
        if (!socket.isAdmin) return;
        if (dbData.people[index]) {
            dbData.people.splice(index, 1);
            saveData();
            io.emit('updateState', dbData);
        }
    });

    // 6. Belohnungen aktualisieren
    socket.on('saveRewards', (newRewards) => {
        if (!socket.isAdmin) return;
        dbData.rewards = newRewards;
        saveData();
        io.emit('updateState', dbData);
    });

    // 7. Glücksrad drehen (Zentral auf dem Server berechnet für Fairness)
    socket.on('spinWheel', () => {
        if (!socket.isAdmin || dbData.people.length === 0) return;

        // Zufälligen Winkel berechnen
        const spinAngle = Math.random() * 2000 + 3000;
        const duration = 3000;

        // Gewinner auf dem Server vorausberechnen
        const numSegments = dbData.people.length;
        const arcSize = (2 * Math.PI) / numSegments;
        const normalizedAngle = (2 * Math.PI - ((spinAngle * Math.PI / 180) % (2 * Math.PI)) + (3 * Math.PI / 2)) % (2 * Math.PI);
        const winningIndex = Math.floor(normalizedAngle / arcSize);

        // Alle Browser anweisen, das Rad zu drehen
        io.emit('startSpin', { spinAngle, duration });

        // Wenn die Drehung fertig ist (nach 'duration' Millisekunden), Punkte updaten
        setTimeout(() => {
            dbData.people[winningIndex].score += 1;
            saveData();
            io.emit('spinResult', dbData.people[winningIndex].name);
            io.emit('updateState', dbData); // Neues Scoreboard an alle
        }, duration);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server läuft! Öffne http://localhost:${PORT} in deinem Browser.`);
});