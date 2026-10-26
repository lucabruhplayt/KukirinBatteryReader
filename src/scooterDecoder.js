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

  // Evidence-based decoding based on confirmed KuKirin G2 serial protocol structure:
  // Requires at least 8 bytes and valid frame header (0xAA 0x55)
  if (bytes.length >= 8 && bytes[0] === 0xAA && bytes[1] === 0x55) {
    const length = bytes[2];
    if (bytes.length >= length + 4) {
      // 1. Speed (km/h) at bytes [3] & [4] (Big-endian 16-bit integer, unit 0.1 km/h)
      const speedRaw = ((bytes[3] & 0xFF) << 8) | (bytes[4] & 0xFF);
      speed = speedRaw / 10.0;

      // 2. Battery Voltage (V) at bytes [6] & [7] (Big-endian 16-bit integer, unit 0.1 V)
      const voltRaw = ((bytes[6] & 0xFF) << 8) | (bytes[7] & 0xFF);
      voltage = voltRaw / 10.0;
    }
  }

  return {
    speed,
    voltage,
    rawBytes: Array.from(bytes),
    hex: hexString
  };
}
