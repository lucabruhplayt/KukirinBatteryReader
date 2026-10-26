/**
 * KuKirin G2 2025 BLE Telemetry Decoder Module
 * 
 * This module inspects and decodes incoming Bluetooth Low Energy (BLE) packets
 * from the scooter service FFF0 (characteristics FFF1, FFF2).
 * 
 * In accordance with project requirements:
 * - Do not invent packet formats or hardcode fake telemetry values.
 * - Log incoming raw BLE data during development.
 * - If the packet format is unknown or lacks evidence, return null for speed and voltage
 *   so the UI displays "Waiting for data".
 */

export function decodeScooterPacket(dataView, characteristicUuid) {
  // Convert DataView to Uint8Array for logging and analysis
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
  
  // Format hex string for logging
  const hexString = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');

  console.log(`[BLE Data] Char: ${characteristicUuid}, Bytes (${bytes.length}): [${hexString}]`);

  // Initialize result
  let speed = null;
  let voltage = null;

  // Evidence-based decoding stub / extensible parser.
  // When real packet logs are captured from the KuKirin G2 2025 scooter,
  // implement exact byte offset parsing here.
  //
  // Example placeholder structure check (uncomment & refine when byte structure is verified):
  // if (bytes.length >= 4) {
  //   // e.g., if header matches scooter protocol header
  //   // speed = ...
  //   // voltage = ...
  // }

  return {
    speed,
    voltage,
    rawBytes: Array.from(bytes),
    hex: hexString
  };
}
