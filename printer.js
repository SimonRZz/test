// ==== Phomemo D30 Web Bluetooth Printer – working Qx protocol version ====

let device = null;
let characteristic = null;
let connected = false;
const statusEl = document.getElementById("status");

// --- Text & Emoji → Bitmap (12×40 mm = 320×96 px) ---
async function textToBitmap(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const labelHeight = 96; // 12 mm × 8 px/mm
  const labelWidth = 320; // 40 mm × 8 px/mm
  canvas.width = labelWidth;
  canvas.height = labelHeight;

  // Weißer Hintergrund
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text & Emojis in Schwarz zentriert
  let fontSize = 36;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  // Doppelte Kontur für kräftigeren Druck
  ctx.lineWidth = 1;
  ctx.strokeStyle = "black";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return convertImageDataToPhomemo(imageData);
}

// --- Proprietäres D30-Bitmap-Format (Qx) ---
function convertImageDataToPhomemo(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bytesPerLine = Math.ceil(width / 8);
  const output = [];

  // Start-Header "Qx" = 0x51 0x78
  output.push(0x51, 0x78, 0x00, 0x00);
  output.push(bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff);
  output.push(height & 0xff, (height >> 8) & 0xff);

  // Pixeldaten (1 = Schwarz)
  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerLine; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = imageData.data[idx];
        if (r < 128) byte |= 1 << (7 - bit); // dunkel = schwarz
      }
      output.push(byte);
    }
  }

  // End-of-frame
  output.push(0x1A);
  return new Uint8Array(output);
}

// --- Schreiben in 512-Byte-Chunks (BLE Limit) ---
async function sendRaw(data) {
  if (!characteristic) throw new Error("Keine Bluetooth-Verbindung");

  const CHUNK_SIZE = 512;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 20));
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

    // Muss direkt im Click-Handler stehen (Chrome verlangt User-Gesture)
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
