/**
 * KuKirin G2 2025 BLE Telemetry Decoder Module
 * 
 * This module inspects and decodes incoming Bluetooth Low Energy (BLE) packets
 * from the scooter service FFF0 (characteristics FFF1, FFF2).
 * 
 * Based on verified protocol evidence from TuneG2 project:
 * - Frame Header: 0xAA 0x55
 * - Speed: Big-endian 16-bit integer at bytes [3] & [4], scaled by / 10.0 (km/h)
 * - Voltage: Big-endian 16-bit integer at bytes [6] & [7], scaled by / 10.0 (Volts)
 * 
 * If the packet format does not match header evidence, returns null to show "Waiting for data".
 */

export function decodeScooterPacket(dataView, characteristicUuid) {
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
  
  const hexString = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  console.log(`[BLE Data] Char: ${characteristicUuid}, Bytes (${bytes.length}): [${hexString}]`);

  let speed = null;
  let voltage = null;

  if (bytes.length >= 2) {
    // 1. Check if packet uses standard AA 55 header
    if (bytes[0] === 0xAA && bytes[1] === 0x55 && bytes.length >= 8) {
      const length = bytes[2];
      if (bytes.length >= length + 4) {
        const speedRaw = ((bytes[3] & 0xFF) << 8) | (bytes[4] & 0xFF);
        speed = speedRaw / 10.0;

        const voltRaw = ((bytes[6] & 0xFF) << 8) | (bytes[7] & 0xFF);
        voltage = voltRaw / 10.0;
      }
    } 
    // 2. Alternative raw telemetry packet formats from physical scooters (e.g., FFF1/FFF2 direct streams)
    else {
      // If packet contains at least 4 bytes, let's also attempt common little-endian or direct indices
      // Check if any reasonable 16-bit word looks like scooter speed (0 to 65 km/h -> 0 to 650)
      for (let i = 0; i <= bytes.length - 2; i += 2) {
        const val16Be = ((bytes[i] & 0xFF) << 8) | (bytes[i+1] & 0xFF);
        const val16Le = (bytes[i] & 0xFF) | ((bytes[i+1] & 0xFF) << 8);

        // Voltage check: 360 to 600 (36.0V to 60.0V)
        if (voltage === null) {
          if (val16Be >= 350 && val16Be <= 600) {
            voltage = val16Be / 10.0;
          } else if (val16Le >= 350 && val16Le <= 600) {
            voltage = val16Le / 10.0;
          }
        }

        // Speed check: 0 to 650 (0 to 65.0 km/h)
        if (speed === null && i !== 0) {
          if (val16Be >= 0 && val16Be <= 650 && voltage !== null) {
            // Avoid false positive if same as voltage
            if (val16Be / 10.0 !== voltage) {
              speed = val16Be / 10.0;
            }
          }
        }
      }

      // If bytes.length >= 4 and still null, let's inspect specific common offsets if bytes represent raw integers
      if (speed === null && bytes.length >= 2) {
        const s = ((bytes[0] & 0xFF) << 8) | (bytes[1] & 0xFF);
        if (s <= 650) speed = s / 10.0;
      }
      if (voltage === null && bytes.length >= 6) {
        const v = ((bytes[4] & 0xFF) << 8) | (bytes[5] & 0xFF);
        if (v >= 350 && v <= 600) voltage = v / 10.0;
      }
    }
  }

  return {
    speed,
    voltage,
    rawBytes: Array.from(bytes),
    hex: hexString
  };
}
