let bluetoothDevice = null;
let printerCharacteristic = null;

const statusEl = document.getElementById('status');

async function connectPrinter() {
  try {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
      statusEl.textContent = "Bereits verbunden mit " + bluetoothDevice.name;
      return;
    }

    if (!bluetoothDevice) {
  bluetoothDevice = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: "Phomemo" },
      { namePrefix: "PM-" },
      { name: "D30" }
    ],
    optionalServices: [0xff00]
  });
}

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(0xff00);
    printerCharacteristic = await service.getCharacteristic(0xff02);

    statusEl.textContent = "Verbunden mit " + bluetoothDevice.name;

    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      statusEl.textContent = "Getrennt – bitte erneut verbinden";
      printerCharacteristic = null;
    });

  } catch (error) {
    console.error(error);
    statusEl.textContent = "Fehler: " + error;
  }
}

async function sendRaw(data) {
  if (!printerCharacteristic) await connectPrinter();
  await printerCharacteristic.writeValue(data);
}

async function textToBitmap(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '24px Arial';
  const width = Math.ceil(ctx.measureText(text).width);
  canvas.width = width;
  canvas.height = 32;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.fillText(text, 0, 24);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return convertImageDataToPhomemo(imageData);
}

function convertImageDataToPhomemo(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const bytesPerLine = Math.ceil(width / 8);
  const output = [];

  output.push(0x1F, 0x11, bytesPerLine & 0xFF, height & 0xFF);

  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerLine; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = imageData.data[idx];
        if (r < 128) byte |= (1 << (7 - bit));
      }
      output.push(byte);
    }
  }

  return new Uint8Array(output);
}

async function printText(text) {
  try {
    if (!printerCharacteristic) await connectPrinter();
    const data = await textToBitmap(text);
    await sendRaw(data);
    await sendRaw(Uint8Array.from([0x0A, 0x0A, 0x0A]));
    statusEl.textContent = "Gedruckt ✅";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Fehler beim Drucken: " + err;
  }
}

document.getElementById('btn-pair').addEventListener('click', async () => {
  await connectPrinter();
});

document.getElementById('btn-print').addEventListener('click', async () => {
  const text = document.getElementById('input').value;
  if (text.trim() === '') {
    statusEl.textContent = "Bitte Text eingeben";
    return;
  }
  await printText(text);
});
