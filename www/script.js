const imageInput = document.getElementById('imageInput');
const cameraInput = document.getElementById('cameraInput');
const cropContainer = document.getElementById('cropContainer');
const canvas = document.getElementById('cropCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');
const hasilTeks = document.getElementById('hasilTeks');
const btnConnect = document.getElementById('btnConnect');
const barcodeArea = document.getElementById('barcodeArea');
const barcodeCanvas = document.getElementById('barcodeCanvas');

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
async function hubungkanBluetooth() {
  if (isCapacitorNative()) {
    const btPlugin = getNativeBluetoothPlugin();
    if (!btPlugin) {
      statusText.style.color = '#dc2626';
      statusText.innerText = 'Plugin Bluetooth native belum terpasang.';
      alert(
        'Plugin Bluetooth native belum terdaftar di Capacitor. Pastikan @capacitor-community/bluetooth-le ada di package.json, build APK sukses, lalu instal APK terbaru.'
      );
      return;
    }

    try {
      statusText.style.color = '#0284c7';
      statusText.innerText = 'Mencari printer Bluetooth (APK)...';

      if (typeof btPlugin.initialize === 'function') {
        await btPlugin.initialize({ androidNeverForLocation: false });
      }

      if (typeof btPlugin.requestDevice === 'function') {
        const device = await btPlugin.requestDevice({
          allowDuplicates: false,
          optionalServices: LAYANAN_PRINTER_UUID
        });

        await btPlugin.connect({ deviceId: device.deviceId });
        const services = await btPlugin.getServices({ deviceId: device.deviceId });

        let charDitemukan = null;
        for (const svc of services || []) {
          const chars = svc.characteristics || [];
          for (const ch of chars) {
            const props = ch.properties || {};
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

        btnConnect.innerText = 'Terhubung: ' + namaPrinterNative;
        btnConnect.style.backgroundColor = '#16a34a';
        statusText.style.color = '#16a34a';
        statusText.innerText = 'Printer siap digunakan (APK)!';
        return;
      }

      const res = await (btPlugin.getDevices ? btPlugin.getDevices() : btPlugin.list());
      const devices = res?.devices || res || [];

      if (!Array.isArray(devices) || devices.length === 0) {
        statusText.style.color = '#dc2626';
        statusText.innerText = 'Tidak ada printer yang di-pair.';
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
      btnConnect.innerText = 'Terhubung: ' + namaPrinterNative;
      btnConnect.style.backgroundColor = '#16a34a';
      statusText.style.color = '#16a34a';
      statusText.innerText = 'Printer siap digunakan (APK)!';
    } catch (error) {
      printerNativeTerhubung = false;
      statusText.style.color = '#dc2626';
      statusText.innerText = 'Gagal terhubung: ' + error.message;
    }
    return;
  }

  if (!navigator.bluetooth) {
    alert('Buka halaman ini lewat Google Chrome untuk memakai Bluetooth!');
    return;
  }

  try {
    statusText.style.color = '#0284c7';
    statusText.innerText = 'Mencari printer Bluetooth...';

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: LAYANAN_PRINTER_UUID
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
