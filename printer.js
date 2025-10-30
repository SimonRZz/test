// ==== Phomemo D30 Web Bluetooth (odensc base + emoji & dual buttons) ====

let device = null;
let characteristic = null;
let connected = false;
const statusEl = document.getElementById("status");

// --- Konvertierung von Text/Emoji zu Bitmap ---
async function textToBitmap(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "24px Arial";
  const textWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = textWidth;
  canvas.height = 32;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.fillText(text, 0, 24);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return convertImageDataToPhomemo(imageData);
}

function convertImageDataToPhomemo(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bytesPerLine = Math.ceil(width / 8);
  const output = [];

  // Startbefehl für Bitmapdruck
  output.push(0x1f, 0x11, bytesPerLine & 0xff, height & 0xff);

  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerLine; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = imageData.data[idx];
        if (r < 128) byte |= 1 << (7 - bit);
      }
      output.push(byte);
    }
  }

  return new Uint8Array(output);
}

// --- Senden der Daten an Drucker ---
async function sendRaw(data) {
  if (!characteristic) throw new Error("Keine Bluetooth-Verbindung");
  await characteristic.writeValue(data);
}

// --- Text drucken ---
async function printText(text) {
  if (!connected) {
    statusEl.textContent = "Bitte zuerst verbinden!";
    return;
  }

  try {
    const bitmap = await textToBitmap(text);
    await sendRaw(bitmap);
    await sendRaw(Uint8Array.from([0x0a, 0x0a, 0x0a]));
    statusEl.textContent = "Gedruckt ✅";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Fehler beim Drucken: " + err.message;
  }
}

// --- Button: Verbinden ---
document.getElementById("btn-pair").addEventListener("click", async () => {
  try {
    if (device && device.gatt.connected) {
      statusEl.textContent = `Bereits verbunden mit ${device.name}`;
      connected = true;
      return;
    }

    // 🔑 WICHTIG: direkt im Click-Handler ausführen!
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [0xff00, 0xff02],
    });

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.writeWithoutResponse || c.properties.write) {
          characteristic = c;
          break;
        }
      }
      if (characteristic) break;
    }

    if (!characteristic)
      throw new Error("Keine gültige Schreib-Characteristic gefunden.");

    connected = true;
    statusEl.textContent = `Verbunden mit ${device.name}`;

    device.addEventListener("gattserverdisconnected", () => {
      connected = false;
      characteristic = null;
      statusEl.textContent = "Verbindung getrennt – bitte erneut verbinden";
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Verbindungsfehler: " + err.message;
  }
});

// --- Button: Drucken ---
document.getElementById("btn-print").addEventListener("click", async () => {
  const text = document.getElementById("input").value;
  if (text.trim() === "") {
    statusEl.textContent = "Bitte Text eingeben";
    return;
  }
  await printText(text);
});
