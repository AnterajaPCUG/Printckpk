const imageInput = document.getElementById('imageInput');
const cropContainer = document.getElementById('cropContainer');
const canvas = document.getElementById('cropCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');
const hasilTeks = document.getElementById('hasilTeks');
const btnConnect = document.getElementById('btnConnect');
const barcodeArea = document.getElementById('barcodeArea');
const barcodeCanvas = document.getElementById('barcodeCanvas');

let karakterPrint = null;
let nilaiBarcodeTerakhir = '';
let gambarAsli = new Image();
let skalaGambar = 1;
let sedangMenyeret = false;
let titikAwal = { x: 0, y: 0 };
let areaCrop = { x: 0, y: 0, w: 0, h: 0 };

// 1. Koneksi Bluetooth ke Printer BTP
async function hubungkanBluetooth() {
  if (!navigator.bluetooth) {
    alert('Buka halaman ini lewat Google Chrome untuk memakai Bluetooth!');
    return;
  }

  try {
    statusText.style.color = '#0284c7';
    statusText.innerText = 'Mencari printer Bluetooth...';

    const layananUUID = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455'
    ];

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: layananUUID
    });

    statusText.innerText = 'Menyambungkan ke ' + (device.name || 'Printer') + '...';
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          karakterPrint = char;
          break;
        }
      }
      if (karakterPrint) break;
    }

    if (karakterPrint) {
      btnConnect.innerText = 'Terhubung: ' + (device.name || 'Printer BTP');
      btnConnect.style.backgroundColor = '#16a34a';
      statusText.style.color = '#16a34a';
      statusText.innerText = 'Printer siap digunakan!';
    } else {
      throw new Error('Karakteristik cetak tidak ditemukan.');
    }
  } catch (error) {
    statusText.style.color = '#dc2626';
    statusText.innerText = 'Gagal terhubung: ' + error.message;
  }
}

async function kirimKePrinter(dataArray) {
  if (!karakterPrint) return;
  const ukuranPaket = 60;
  for (let i = 0; i < dataArray.length; i += ukuranPaket) {
    const potongan = dataArray.slice(i, i + ukuranPaket);
    if (karakterPrint.properties.writeWithoutResponse) {
      await karakterPrint.writeValueWithoutResponse(potongan);
    } else {
      await karakterPrint.writeValue(potongan);
    }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

// 2. Cetak Potongan Gambar Crop ke BTP 80mm
async function cetakGambarBluetooth() {
  if (!gambarAsli.src) {
    alert('Pilih dan potong gambar terlebih dahulu!');
    return;
  }
  if (!karakterPrint) {
    await hubungkanBluetooth();
    if (!karakterPrint) return;
  }

  statusText.style.color = '#0284c7';
  statusText.innerText = 'Mencetak gambar ke BTP 80mm...';

  try {
    const lebarCetak = 576;
    const potongCanvas = buatCanvasPotongan(lebarCetak);
    const tinggiCetak = potongCanvas.height;
    const pCtx = potongCanvas.getContext('2d');
    const imgData = pCtx.getImageData(0, 0, lebarCetak, tinggiCetak).data;

    const bytesPerBaris = lebarCetak / 8;
    const totalBytesGambar = bytesPerBaris * tinggiCetak;

    const header = new Uint8Array([
      0x1B, 0x40,
      0x1D, 0x76, 0x30, 0x00,
      bytesPerBaris & 0xFF, (bytesPerBaris >> 8) & 0xFF,
      tinggiCetak & 0xFF, (tinggiCetak >> 8) & 0xFF
    ]);

    const rasterData = new Uint8Array(totalBytesGambar);
    let indeksByte = 0;

    for (let y = 0; y < tinggiCetak; y++) {
      for (let xByte = 0; xByte < bytesPerBaris; xByte++) {
        let byteSekarang = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          const posPixel = (y * lebarCetak + x) * 4;
          const r = imgData.at(posPixel);
          const g = imgData.at(posPixel + 1);
          const b = imgData.at(posPixel + 2);
          const kecerahan = (r + g + b) / 3;

          if (kecerahan < 185) {
            byteSekarang |= (1 << (7 - bit));
          }
        }
        rasterData[indeksByte++] = byteSekarang;
      }
    }

    const footer = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x10]);
    const paketLengkap = new Uint8Array(header.length + rasterData.length + footer.length);
    paketLengkap.set(header, 0);
    paketLengkap.set(rasterData, header.length);
    paketLengkap.set(footer, header.length + rasterData.length);

    await kirimKePrinter(paketLengkap);
    statusText.style.color = '#16a34a';
    statusText.innerText = 'Gambar berhasil dicetak ke BTP 80mm!';
  } catch (err) {
    statusText.style.color = '#dc2626';
    statusText.innerText = 'Gagal mencetak: ' + err.message;
  }
}

// 3. Cetak Teks + Barcode Hasil Crop Jadi Satu Resi ke BTP-P33
async function cetakTeksBluetooth() {
  const isiTeks = hasilTeks.value.trim();
  const adaBarcode = barcodeArea.style.display === 'block' && nilaiBarcodeTerakhir !== '';

  if (!isiTeks && !adaBarcode) {
    alert('Kotak masih kosong. Belum ada teks atau barcode untuk dicetak.');
    return;
  }

  if (!karakterPrint) {
    await hubungkanBluetooth();
    if (!karakterPrint) return;
  }

  statusText.style.color = '#0284c7';
  statusText.innerText = 'Mencetak Teks & Barcode ke BTP 80mm...';

  try {
    const encoder = new TextEncoder();
    let kumpulanPerintah = Array.of(0x1B, 0x40); // Reset printer

    if (isiTeks) {
      kumpulanPerintah.push(0x1B, 0x61, 0x00); // Rata kiri untuk alamat
      const teksBytes = encoder.encode(isiTeks + '\n\n');
      for (const b of teksBytes) {
        kumpulanPerintah.push(b);
      }
    }

    if (adaBarcode) {
      const teksBarcode = nilaiBarcodeTerakhir.replace(/[^\x20-\x7E]/g, '');
      const dataBarcode = '{B' + teksBarcode;
      const bytesBarcode = encoder.encode(dataBarcode);

      kumpulanPerintah.push(
        0x1B, 0x61, 0x01, // Rata tengah
        0x1D, 0x48, 0x02, // Cetak angka resi di bawah garis barcode
        0x1D, 0x66, 0x00, // Font standar
        0x1D, 0x68, 0x50, // Tinggi barcode 80 dots
        0x1D, 0x77, 0x02, // Lebar garis sedang
        0x1D, 0x6B, 0x49, bytesBarcode.length
      );

      for (const b of bytesBarcode) {
        kumpulanPerintah.push(b);
      }
    }

    kumpulanPerintah.push(0x0A, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x10);
    await kirimKePrinter(new Uint8Array(kumpulanPerintah));

    statusText.style.color = '#16a34a';
    statusText.innerText = 'Teks & Barcode (' + nilaiBarcodeTerakhir + ') berhasil dicetak!';
  } catch (err) {
    statusText.style.color = '#dc2626';
    statusText.innerText = 'Gagal mencetak: ' + err.message;
  }
}

// 4. Ubah Hasil Crop Menjadi Barcode Code 128
function buatBarcodeDariTeks(teksKhusus = null) {
  const sumberTeks = (typeof teksKhusus === 'string') ? teksKhusus : hasilTeks.value;
  const isiTeks = sumberTeks.trim().replace(/\s+/g, ' ');

  if (!isiTeks) {
    alert('Teks kosong! Scan area foto atau ketik nomor resi terlebih dahulu.');
    return;
  }

  nilaiBarcodeTerakhir = isiTeks;

  const polaCode128 = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];

  let daftarKode = Array.of(104);
  let checksum = 104;

  for (let i = 0; i < isiTeks.length; i++) {
    let kodeAscii = isiTeks.charCodeAt(i) - 32;
    if (kodeAscii < 0 || kodeAscii > 94) kodeAscii = 0;
    daftarKode.push(kodeAscii);
    checksum += kodeAscii * (i + 1);
  }

  daftarKode.push(checksum % 103);
  daftarKode.push(106);

  let rangkaianBar = "";
  for (const idx of daftarKode) {
    rangkaianBar += polaCode128.at(idx);
  }

  const lebarModul = 2;
  const totalModul = rangkaianBar.split('').reduce((a, b) => a + Number(b), 0);
  const marginSamping = 20;
  const tinggiBar = 70;
  const tinggiTeks = 24;

  barcodeCanvas.width = (totalModul * lebarModul) + (marginSamping * 2);
  barcodeCanvas.height = tinggiBar + tinggiTeks + 16;

  const bCtx = barcodeCanvas.getContext('2d');
  bCtx.fillStyle = '#ffffff';
  bCtx.fillRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);

  let posisiX = marginSamping;
  for (let i = 0; i < rangkaianBar.length; i++) {
    const lebarBatang = Number(rangkaianBar.at(i)) * lebarModul;
    if (i % 2 === 0) {
      bCtx.fillStyle = '#000000';
      bCtx.fillRect(posisiX, 8, lebarBatang, tinggiBar);
    }
    posisiX += lebarBatang;
  }

  bCtx.fillStyle = '#000000';
  bCtx.font = 'bold 14px monospace';
  bCtx.textAlign = 'center';
  bCtx.fillText(isiTeks, barcodeCanvas.width / 2, tinggiBar + 26);

  barcodeArea.style.display = 'block';
  statusText.style.color = '#7c3aed';
  statusText.innerText = 'Barcode (' + isiTeks + ') tersimpan! Sekarang kamu bisa crop teks alamat.';
}

// 5. Crop Gambar di Canvas
imageInput.addEventListener('change', function(event) {
const file = event.target.files.item(0);
if (!file) return;
const reader = new FileReader();
reader.onload = function(e) {
gambarAsli = new Image();
gambarAsli.onload = function() {
const lebarMaks = 420;
skalaGambar = gambarAsli.width > lebarMaks ? lebarMaks / gambarAsli.width : 1;
canvas.width = gambarAsli.width * skalaGambar;
canvas.height = gambarAsli.height * skalaGambar;
resetCrop();
cropContainer.style.display = 'block';
statusText.style.color = '#0284c7';
statusText.innerText = 'Gambar siap! Seret kotak biru lalu pilih "Jadi Barcode" atau "Jadi Teks".';
};
gambarAsli.src = e.target.result;
};
reader.readAsDataURL(file);
});
function gambarUlangCanvas() {
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(gambarAsli, 0, 0, canvas.width, canvas.height);
ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
ctx.fillRect(0, 0, canvas.width, areaCrop.y);
ctx.fillRect(0, areaCrop.y + areaCrop.h, canvas.width, canvas.height - (areaCrop.y + areaCrop.h));
ctx.fillRect(0, areaCrop.y, areaCrop.x, areaCrop.h);
ctx.fillRect(areaCrop.x + areaCrop.w, areaCrop.y, canvas.width - (areaCrop.x + areaCrop.w), areaCrop.h);
ctx.strokeStyle = '#3b82f6';
ctx.lineWidth = 3;
ctx.strokeRect(areaCrop.x, areaCrop.y, areaCrop.w, areaCrop.h);
}
function resetCrop() {
areaCrop = { x: 0, y: 0, w: canvas.width, h: canvas.height };
gambarUlangCanvas();
}
function ambilPosisi(e) {
const rect = canvas.getBoundingClientRect();
const clientX = e.touches ? e.touches.item(0).clientX : e.clientX;
const clientY = e.touches ? e.touches.item(0).clientY : e.clientY;
return {
x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width))),
y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * (canvas.height / rect.height)))
};
}
function mulaiSentuh(e) {
sedangMenyeret = true;
titikAwal = ambilPosisi(e);
areaCrop = { x: titikAwal.x, y: titikAwal.y, w: 0, h: 0 };
}
function geserSentuh(e) {
if (!sedangMenyeret) return;
e.preventDefault();
const posSekarang = ambilPosisi(e);
areaCrop.x = Math.min(titikAwal.x, posSekarang.x);
areaCrop.y = Math.min(titikAwal.y, posSekarang.y);
areaCrop.w = Math.abs(posSekarang.x - titikAwal.x);
areaCrop.h = Math.abs(posSekarang.y - titikAwal.y);
gambarUlangCanvas();
}
function selesaiSentuh() {
if (!sedangMenyeret) return;
sedangMenyeret = false;
if (areaCrop.w < 25 || areaCrop.h < 25) resetCrop();
}
canvas.addEventListener('mousedown', mulaiSentuh);
canvas.addEventListener('mousemove', geserSentuh);
window.addEventListener('mouseup', selesaiSentuh);
canvas.addEventListener('touchstart', mulaiSentuh, { passive: false });
canvas.addEventListener('touchmove', geserSentuh, { passive: false });
canvas.addEventListener('touchend', selesaiSentuh);
function buatCanvasPotongan(lebarTarget) {
const potongCanvas = document.createElement('canvas');
let asliX = areaCrop.x / skalaGambar;
let asliY = areaCrop.y / skalaGambar;
let asliW = areaCrop.w / skalaGambar;
let asliH = areaCrop.h / skalaGambar;
const rasio = lebarTarget / asliW;
potongCanvas.width = lebarTarget;
potongCanvas.height = Math.max(10, Math.round(asliH * rasio));
const pCtx = potongCanvas.getContext('2d');
pCtx.fillStyle = '#ffffff';
pCtx.fillRect(0, 0, potongCanvas.width, potongCanvas.height);
pCtx.filter = 'grayscale(100%) contrast(150%)';
pCtx.drawImage(gambarAsli, asliX, asliY, asliW, asliH, 0, 0, potongCanvas.width, potongCanvas.height);
return potongCanvas;
}
// 6. Scan Area Crop (Jadi Barcode atau Tambah Teks)
async function prosesScan(otomatisBarcode = false) {
if (!gambarAsli.src) {
alert('Pilih gambar terlebih dahulu!');
return;
}
statusText.style.color = '#0284c7';
statusText.innerText = 'Membaca area terpilih...';
try {
const hasilPotong = buatCanvasPotongan(1200);
const filePotongan = await new Promise((resolve) => {
hasilPotong.toBlob((blob) => {
resolve(new File([blob], 'crop.jpg', { type: 'image/jpeg' }));
}, 'image/jpeg', 0.9);
});
const formData = new FormData();
formData.append('file', filePotongan);
formData.append('apikey', 'K8166195928459888957');
formData.append('language', 'auto');
formData.append('OCREngine', '2');
const endpointAPI = 'https://' + 'api.ocr.space/parse/image';
const response = await fetch(endpointAPI, {
method: 'POST',
body: formData
});
const teksMentah = await response.text();
if (!teksMentah) {
throw new Error('Server sibuk. Coba beberapa saat lagi.');
}
const result = JSON.parse(teksMentah);
if (Array.isArray(result.ParsedResults) && result.ParsedResults.length > 0) {
const hasilPertama = result.ParsedResults.shift();
const teksBaru = (hasilPertama.ParsedText || '').trim();
if (otomatisBarcode) {
buatBarcodeDariTeks(teksBaru);
} else {
if (hasilTeks.value.trim() !== '') {
hasilTeks.value = hasilTeks.value.trim() + '\n' + teksBaru;
} else {
hasilTeks.value = teksBaru;
}
statusText.style.color = '#16a34a';
statusText.innerText = 'Teks ditambahkan! Barcode (' + nilaiBarcodeTerakhir + ') tetap aman.';
}
} else {
statusText.style.color = '#dc2626';
statusText.innerText = 'Gagal membaca: ' + (result.ErrorMessage || 'Teks tidak terdeteksi.');
}
} catch (error) {
statusText.style.color = '#dc2626';
statusText.innerText = 'Error: ' + error.message;
}
}
function salinTeks() {
if (!hasilTeks.value) return;
hasilTeks.select();
navigator.clipboard.writeText(hasilTeks.value);
alert('Teks berhasil disalin!');
}
function hapusKotakHasil() {
  hasilTeks.value = '';
  nilaiBarcodeTerakhir = '';
  barcodeArea.style.display = 'none';
  
  const bCtx = barcodeCanvas.getContext('2d');
  bCtx.clearRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);

  statusText.style.color = '#64748b';
  statusText.innerText = 'Kotak teks & barcode telah dibersihkan.';
}
