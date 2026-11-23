let imageInput = document.getElementById('imageInput');
let cameraInput = document.getElementById('cameraInput');
let cropContainer = document.getElementById('cropContainer');
let canvas = document.getElementById('cropCanvas');
let ctx = canvas ? canvas.getContext('2d') : null;
let statusText = document.getElementById('status');
let hasilTeks = document.getElementById('hasilTeks');
let btnConnect = document.getElementById('btnConnect');
let barcodeArea = document.getElementById('barcodeArea');
let barcodeCanvas = document.getElementById('barcodeCanvas');

let karakterPrint = null;
let printerNativeTerhubung = false;
let perangkatBleTerhubung = null;
let layananBleAktif = null;
let karakteristikBleAktif = null;
let alamatPrinterNative = null;
let namaPrinterNative = null;
let nilaiBarcodeTerakhir = '';
let gambarAsli = new Image();
let skalaGambar = 1;
let sedangMenyeret = false;
let titikAwal = { x: 0, y: 0 };
let areaCrop = { x: 0, y: 0, w: 0, h: 0 };

const LAYANAN_PRINTER_UUID = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

const isCapacitorNative = () => {
  return Boolean(
    window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
  );
};

function getNativeBluetoothPlugin() {
  const plugins = window.Capacitor?.Plugins || {};
  return (
    plugins.BluetoothLe ||
    plugins.BluetoothPrinter ||
    plugins.ThermalPrinter ||
    plugins.BluetoothSerial ||
    null
  );
}

function printerSudahSiap() {
  return isCapacitorNative() ? Boolean(printerNativeTerhubung) : Boolean(karakterPrint);
}

function uint8KeHex(dataArray) {
  return Array.from(dataArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bacaTeksHasil() {
  if (!hasilTeks) return '';
  if (typeof hasilTeks.value === 'string') return hasilTeks.value;
  return hasilTeks.textContent || '';
}

function tulisTeksHasil(teksBaru) {
  if (!hasilTeks) return;
  if (typeof hasilTeks.value === 'string') {
    hasilTeks.value = teksBaru;
  } else {
    hasilTeks.textContent = teksBaru;
  }
}

function setStatus(pesan, warna = '#0284c7') {
  if (!statusText) return;
  statusText.style.color = warna;
  statusText.innerText = pesan;
}

function perbaruiReferensiDOM() {
  imageInput = document.getElementById('imageInput');
  cameraInput = document.getElementById('cameraInput');
  cropContainer = document.getElementById('cropContainer');
  canvas = document.getElementById('cropCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  statusText = document.getElementById('status');
  hasilTeks = document.getElementById('hasilTeks');
  btnConnect = document.getElementById('btnConnect');
  barcodeArea = document.getElementById('barcodeArea');
  barcodeCanvas = document.getElementById('barcodeCanvas');

  if (imageInput && !imageInput.dataset.sudahPasang) {
    imageInput.addEventListener('change', muatGambarDariInput);
    imageInput.dataset.sudahPasang = '1';
  }

  if (cameraInput && !cameraInput.dataset.sudahPasang) {
    cameraInput.addEventListener('change', muatGambarDariInput);
    cameraInput.dataset.sudahPasang = '1';
  }

  if (canvas && !canvas.dataset.sudahPasang) {
    canvas.addEventListener('mousedown', mulaiSentuh);
    canvas.addEventListener('mousemove', geserSentuh);
    window.addEventListener('mouseup', selesaiSentuh);
    canvas.addEventListener('touchstart', mulaiSentuh, { passive: false });
    canvas.addEventListener('touchmove', geserSentuh, { passive: false });
    canvas.addEventListener('touchend', selesaiSentuh);
    canvas.dataset.sudahPasang = '1';
  }
}

// 1. Koneksi Bluetooth ke Printer BTP (APK Capacitor & Browser Chrome)
async function hubungkanBluetooth() {
  perbaruiReferensiDOM();

  if (isCapacitorNative()) {
    const btPlugin = getNativeBluetoothPlugin();
    if (!btPlugin) {
      setStatus('Plugin Bluetooth native belum terpasang.', '#dc2626');
      alert(
        'Plugin Bluetooth native belum terdaftar di Capacitor. Pastikan @capacitor-community/bluetooth-le ada di package.json, build APK sukses, lalu instal APK terbaru.'
      );
      return;
    }

    try {
      setStatus('Mencari printer Bluetooth (APK)...', '#0284c7');

      if (typeof btPlugin.initialize === 'function') {
        await btPlugin.initialize({ androidNeverForLocation: false });
      }

      if (typeof btPlugin.requestDevice === 'function') {
        const device = await btPlugin.requestDevice({
          allowDuplicates: false,
          optionalServices: LAYANAN_PRINTER_UUID
        });

        await btPlugin.connect({ deviceId: device.deviceId });
        const hasilServices = await btPlugin.getServices({ deviceId: device.deviceId });
        const daftarLayanan = Array.isArray(hasilServices)
          ? hasilServices
          : Array.isArray(hasilServices?.services)
          ? hasilServices.services
          : [];

        let charDitemukan = null;
        for (const svc of daftarLayanan) {
          const chars = Array.isArray(svc?.characteristics) ? svc.characteristics : [];
          for (const ch of chars) {
            const props = ch?.properties || {};
            if (props.write || props.writeWithoutResponse) {
              charDitemukan = {
                service: svc.uuid,
                characteristic: ch.uuid,
                writeWithoutResponse: Boolean(props.writeWithoutResponse)
              };
              break;
            }
          }
          if (charDitemukan) break;
        }

        if (!charDitemukan) {
          throw new Error('Karakteristik tulis BLE pada printer tidak ditemukan.');
        }

        perangkatBleTerhubung = device.deviceId;
        layananBleAktif = charDitemukan.service;
        karakteristikBleAktif = charDitemukan;
        alamatPrinterNative = device.deviceId;
        namaPrinterNative = device.name || device.deviceId;
        printerNativeTerhubung = true;

        if (btnConnect) {
          btnConnect.innerText = 'Terhubung: ' + namaPrinterNative;
          btnConnect.style.backgroundColor = '#16a34a';
        }
        setStatus('Printer siap digunakan (APK)!', '#16a34a');
        return;
      }

      const res = await (btPlugin.getDevices ? btPlugin.getDevices() : btPlugin.list());
      const devices = res?.devices || res || [];

      if (!Array.isArray(devices) || devices.length === 0) {
        setStatus('Tidak ada printer yang di-pair.', '#dc2626');
        alert('Pasangkan (pair) printer Bluetooth dulu di Pengaturan HP.');
        return;
      }

      const target = devices[0];
      alamatPrinterNative = target.address || target.id || target.macAddress;
      namaPrinterNative = target.name || alamatPrinterNative;

      if (btPlugin.connect) {
        await btPlugin.connect({ address: alamatPrinterNative });
      }

      printerNativeTerhubung = true;
      if (btnConnect) {
        btnConnect.innerText = 'Terhubung: ' + namaPrinterNative;
        btnConnect.style.backgroundColor = '#16a34a';
      }
      setStatus('Printer siap digunakan (APK)!', '#16a34a');
    } catch (error) {
      printerNativeTerhubung = false;
      setStatus('Gagal terhubung: ' + error.message, '#dc2626');
    }
    return;
  }

  if (!navigator.bluetooth) {
    alert('Buka halaman ini lewat Google Chrome untuk memakai Bluetooth!');
    return;
  }

  try {
    setStatus('Mencari printer Bluetooth...', '#0284c7');

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: LAYANAN_PRINTER_UUID
    });

    setStatus('Menyambungkan ke ' + (device.name || 'Printer') + '...', '#0284c7');
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
      if (btnConnect) {
        btnConnect.innerText = 'Terhubung: ' + (device.name || 'Printer BTP');
        btnConnect.style.backgroundColor = '#16a34a';
      }
      setStatus('Printer siap digunakan!', '#16a34a');
    } else {
      throw new Error('Karakteristik cetak tidak ditemukan.');
    }
  } catch (error) {
    setStatus('Gagal terhubung: ' + error.message, '#dc2626');
  }
}

async function kirimKePrinter(dataArray) {
  if (isCapacitorNative()) {
    const btPlugin = getNativeBluetoothPlugin();
    if (!btPlugin || !printerNativeTerhubung) {
      throw new Error('Printer native APK belum terhubung.');
    }

    const ukuranPaket = 60;
    if (perangkatBleTerhubung && karakteristikBleAktif && typeof btPlugin.write === 'function') {
      for (let i = 0; i < dataArray.length; i += ukuranPaket) {
        const potongan = dataArray.slice(i, i + ukuranPaket);
        await btPlugin.write({
          deviceId: perangkatBleTerhubung,
          service: layananBleAktif,
          characteristic: karakteristikBleAktif.characteristic,
          value: uint8KeHex(potongan)
        });
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return;
    }

    const bytesArray = Array.from(dataArray);
    if (btPlugin.writeBytes) {
      await btPlugin.writeBytes({ address: alamatPrinterNative, bytes: bytesArray });
    } else if (btPlugin.write) {
      const decoder = new TextDecoder();
      await btPlugin.write({ address: alamatPrinterNative, value: decoder.decode(dataArray) });
    } else {
      throw new Error('Metode tulis data pada plugin Bluetooth native belum sesuai.');
    }
    return;
  }

  if (!karakterPrint) return;
  const ukuranPaket = 60;
  for (let i = 0; i < dataArray.length; i += ukuranPaket) {
    const potongan = dataArray.slice(i, i + ukuranPaket);
    if (karakterPrint.properties.writeWithoutResponse) {
      await karakterPrint.writeValueWithoutResponse(potongan);
    } else {
      await karakterPrint.writeValue(potongan);
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
// 2. Cetak Potongan Gambar Crop ke BTP 80mm
async function cetakGambarBluetooth() {
  perbaruiReferensiDOM();
  if (!gambarAsli || !gambarAsli.src) {
    alert('Pilih atau foto gambar terlebih dahulu!');
    return;
  }
  if (!printerSudahSiap()) {
    await hubungkanBluetooth();
    if (!printerSudahSiap()) return;
  }

  setStatus('Mencetak gambar ke BTP 80mm...', '#0284c7');

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
    setStatus('Gambar berhasil dicetak ke BTP 80mm!', '#16a34a');
  } catch (err) {
    setStatus('Gagal mencetak: ' + err.message, '#dc2626');
  }
}

// 3. Cetak Teks + Barcode Jadi Satu Resi ke BTP-P33
async function cetakTeksBluetooth() {
  perbaruiReferensiDOM();
  const isiTeks = bacaTeksHasil().trim();
  const adaBarcode = barcodeArea && barcodeArea.style.display === 'block' && nilaiBarcodeTerakhir !== '';

  if (!isiTeks && !adaBarcode) {
    alert('Kotak masih kosong. Belum ada teks atau barcode untuk dicetak.');
    return;
  }

  if (!printerSudahSiap()) {
    await hubungkanBluetooth();
    if (!printerSudahSiap()) return;
  }

  setStatus('Mencetak Teks & Barcode ke BTP 80mm...', '#0284c7');

  try {
    const encoder = new TextEncoder();
    let kumpulanPerintah = Array.of(0x1B, 0x40);

    if (isiTeks) {
      kumpulanPerintah.push(0x1B, 0x61, 0x00);
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
        0x1B, 0x61, 0x01,
        0x1D, 0x48, 0x02,
        0x1D, 0x66, 0x00,
        0x1D, 0x68, 0x50,
        0x1D, 0x77, 0x02,
        0x1D, 0x6B, 0x49, bytesBarcode.length
      );

      for (const b of bytesBarcode) {
        kumpulanPerintah.push(b);
      }
    }

    kumpulanPerintah.push(0x0A, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x10);
    await kirimKePrinter(new Uint8Array(kumpulanPerintah));

    setStatus('Teks & Barcode (' + nilaiBarcodeTerakhir + ') berhasil dicetak!', '#16a34a');
  } catch (err) {
    setStatus('Gagal mencetak: ' + err.message, '#dc2626');
  }
}

// 4. Ubah Hasil Crop / Teks Menjadi Barcode Code 128
function buatBarcodeDariTeks(teksKhusus = null) {
  perbaruiReferensiDOM();
  const sumberTeks = (typeof teksKhusus === 'string') ? teksKhusus : bacaTeksHasil();
  const isiTeks = sumberTeks.trim().replace(/\s+/g, ' ');

  if (!isiTeks) {
    setStatus('Teks kosong! Scan area foto atau ketik nomor resi terlebih dahulu.', '#dc2626');
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

  if (!barcodeCanvas) return;
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

  if (barcodeArea) {
    barcodeArea.style.display = 'block';
  }
  setStatus('Barcode (' + isiTeks + ') tersimpan! Sekarang kamu bisa crop teks alamat.', '#7c3aed');
    }
// 5. Muat Gambar dari Kamera maupun Galeri
function muatGambarDariInput(event) {
  perbaruiReferensiDOM();
  const daftarFile = event?.target?.files;
  const file = daftarFile && daftarFile.length > 0 ? daftarFile[0] : null;

  if (!file) {
    setStatus('Tidak ada foto yang dipilih atau akses file dibatalkan.', '#dc2626');
    return;
  }

  setStatus('Memuat foto ke layar...', '#0284c7');

  const urlFoto = URL.createObjectURL(file);
  const imgBaru = new Image();

  imgBaru.onload = function () {
    gambarAsli = imgBaru;
    if (!canvas) {
      URL.revokeObjectURL(urlFoto);
      return;
    }

    const lebarMaks = 420;
    skalaGambar = gambarAsli.width > lebarMaks ? lebarMaks / gambarAsli.width : 1;
    canvas.width = Math.max(1, Math.round(gambarAsli.width * skalaGambar));
    canvas.height = Math.max(1, Math.round(gambarAsli.height * skalaGambar));

    resetCrop();
    if (cropContainer) {
      cropContainer.style.display = 'block';
    }
    setStatus('Gambar siap! Seret kotak biru lalu pilih "Jadi Barcode" atau "Jadi Teks".', '#0284c7');
    URL.revokeObjectURL(urlFoto);
  };

  imgBaru.onerror = function () {
    URL.revokeObjectURL(urlFoto);
    setStatus('Gagal menampilkan foto. Cek izin kamera/galeri atau coba pilih foto lain.', '#dc2626');
  };

  imgBaru.src = urlFoto;
  if (event?.target) {
    event.target.value = '';
  }
}

function gambarUlangCanvas() {
  if (!canvas || !ctx || !gambarAsli.src) return;
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
  if (!canvas) return;
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

function buatCanvasPotongan(lebarTarget) {
  perbaruiReferensiDOM();
  if (!gambarAsli || !gambarAsli.naturalWidth || !gambarAsli.naturalHeight) {
    throw new Error('Gambar belum termuat sempurna.');
  }

  let wCrop = areaCrop.w;
  let hCrop = areaCrop.h;
  let xCrop = areaCrop.x;
  let yCrop = areaCrop.y;

  if (!wCrop || wCrop < 10 || !hCrop || hCrop < 10) {
    xCrop = 0;
    yCrop = 0;
    wCrop = canvas ? canvas.width : gambarAsli.naturalWidth;
    hCrop = canvas ? canvas.height : gambarAsli.naturalHeight;
  }

  const skalaAktif = skalaGambar > 0 ? skalaGambar : 1;
  const asliX = Math.max(0, xCrop / skalaAktif);
  const asliY = Math.max(0, yCrop / skalaAktif);
  const asliW = Math.max(10, Math.min(gambarAsli.naturalWidth - asliX, wCrop / skalaAktif));
  const asliH = Math.max(10, Math.min(gambarAsli.naturalHeight - asliY, hCrop / skalaAktif));

  const potongCanvas = document.createElement('canvas');
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
  perbaruiReferensiDOM();
  if (!gambarAsli || !gambarAsli.src) {
    alert('Pilih atau foto gambar terlebih dahulu!');
    return;
  }

  setStatus('Membaca area terpilih...', '#0284c7');

  try {
    const hasilPotong = buatCanvasPotongan(1200);
    const filePotongan = await new Promise((resolve, reject) => {
      hasilPotong.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Gagal membuat potongan gambar.'));
          return;
        }
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

      if (!teksBaru) {
        setStatus('Teks pada area crop tidak terbaca. Coba perjelas atau perbesar area crop.', '#dc2626');
        return;
      }

      if (otomatisBarcode) {
        buatBarcodeDariTeks(teksBaru);
      } else {
        const teksLama = bacaTeksHasil().trim();
        const gabungan = teksLama !== '' ? teksLama + '\n' + teksBaru : teksBaru;
        tulisTeksHasil(gabungan);
        setStatus('Teks ditambahkan! Barcode (' + nilaiBarcodeTerakhir + ') tetap aman.', '#16a34a');
      }
    } else {
      setStatus('Gagal membaca: ' + (result.ErrorMessage || 'Teks tidak terdeteksi.'), '#dc2626');
    }
  } catch (error) {
    setStatus('Error: ' + error.message, '#dc2626');
  }
}

function salinTeks() {
  perbaruiReferensiDOM();
  const isi = bacaTeksHasil();
  if (!isi) return;
  if (typeof hasilTeks?.select === 'function') {
    hasilTeks.select();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(isi);
  }
  alert('Teks berhasil disalin!');
}

function hapusKotakHasil() {
  perbaruiReferensiDOM();
  tulisTeksHasil('');
  nilaiBarcodeTerakhir = '';
  if (barcodeArea) barcodeArea.style.display = 'none';

  if (barcodeCanvas) {
    const bCtx = barcodeCanvas.getContext('2d');
    bCtx.clearRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);
  }

  setStatus('Kotak teks & barcode telah dibersihkan.', '#64748b');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', perbaruiReferensiDOM);
} else {
  perbaruiReferensiDOM();
}
