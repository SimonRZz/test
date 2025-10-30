// ==== Phomemo D30 Web Bluetooth Printer – fixed D30 command set ====

let device = null;
let characteristic = null;
let connected = false;
const statusEl = document.getElementById("status");

// --- Text & Emoji → Bitmap (12×40 mm = 320×96 px) ---
async function textToBitmap(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // 12 mm × 8 px/mm = 96 px Höhe, 40 mm × 8 px/mm = 320 px Breite
  const labelHeight = 96;
  const labelWidth = 320;
  canvas.width = labelWidth;
  canvas.height = labelHeight;

  // Hintergrund weiß
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

// Schwarzer Text zentriert
ctx.font = `bold ${fontSize}px Arial`;
ctx.fillStyle = "black";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText(text, canvas.width / 2, canvas.height / 2);


  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return convertImageDataToPhomemo(imageData);
}

// --- D30-kompatible Bitmap-Erzeugung ---
function convertImageDataToPhomemo(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bytesPerLine = Math.ceil(width / 8);
  const output = [];

  // Korrektes D30-Header-Format: ESC L (0x1B 0x4C)
  output.push(0x1B, 0x4C);

  // Breite (low/high)
  output.push(bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff);
  // Höhe (low/high)
  output.push(height & 0xff, (height >> 8) & 0xff);

  // Pixeldaten (invertiert: 1 = Schwarz)
  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerLine; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = imageData.data[idx];
        if (r > 128) byte |= 1 << (7 - bit);
      }
      output.push(byte);
    }
  }

  // Zeilenumbruch
  output.push(0x0a);
  return new Uint8Array(output);
}

// --- Schreiben in 512-Byte-Chunks ---
async function sendRaw(data) {
  if (!characteristic) throw new Error("Keine Bluetooth-Verbindung");

  const CHUNK_SIZE = 512;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
    await new Promise(r => setTimeout(r, 20)); // kleine Pause
  }
}

// --- Drucken ---
async function printText(text) {
  if (!connected) {
    statusEl.textContent = "Bitte zuerst verbinden!";
    return;
  }
  try {
    const bitmap = await textToBitmap(text);
    await sendRaw(bitmap);
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

    // Direkt im Click-Handler – Chrome verlangt User-Gesture
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
