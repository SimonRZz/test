// ==== Phomemo D30 Debug Printer – Testet mehrere Protokolle ====

let device = null;
let characteristic = null;
let connected = false;
const statusEl = document.getElementById("status");

// kleine 96x96 px Test-Block-Bitmap
function makeTestBitmap() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  return imageData;
}

// konvertiert das Bild in D30-kompatibles 1-Bit-Array
function to1Bit(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bytesPerLine = Math.ceil(width / 8);
  const bytes = [];

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
      bytes.push(byte);
    }
  }
  return { width, height, bytesPerLine, bytes };
}

// erzeugt verschiedene Header-Varianten
function makeVariants(img) {
  const { width, height, bytesPerLine, bytes } = img;
  const variants = [];

  // Variante 1 – ESC L
  let escL = [0x1B, 0x4C, bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF, ...bytes, 0x0A];
  variants.push({ name: "ESC L", data: new Uint8Array(escL) });

  // Variante 2 – Qx (0x51 0x78)
  let qx = [0x51, 0x78, 0x00, 0x00, bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF, ...bytes, 0x1A];
  variants.push({ name: "Qx", data: new Uint8Array(qx) });

  // Variante 3 – 0x12 0x54 (neue D30+)
  let t12 = [0x12, 0x54, bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF, ...bytes, 0x0A];
  variants.push({ name: "12 54", data: new Uint8Array(t12) });

  return variants;
}

// --- Schreiben in 512-Byte-Chunks ---
async function sendRaw(data) {
  const CHUNK_SIZE = 512;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// --- Testfunktion ---
async function testPrinter() {
  if (!connected) {
    statusEl.textContent = "Bitte zuerst verbinden!";
    return;
  }

  try {
    const img = to1Bit(makeTestBitmap());
    const variants = makeVariants(img);

    for (let v of variants) {
      statusEl.textContent = `Teste Variante: ${v.name}...`;
      console.log(`Sende Variante: ${v.name}`);
      await sendRaw(v.data);
      await new Promise((r) => setTimeout(r, 1500));
    }

    statusEl.textContent = "Test abgeschlossen. Welche Variante hat gedruckt?";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Fehler beim Test: " + err.message;
  }
}

// --- Verbinden ---
document.getElementById("btn-pair").addEventListener("click", async () => {
  try {
    if (device && device.gatt.connected) {
      statusEl.textContent = `Bereits verbunden mit ${device.name}`;
      connected = true;
      return;
    }

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

// --- Button: Test ---
document.getElementById("btn-print").addEventListener("click", async () => {
  await testPrinter();
});
