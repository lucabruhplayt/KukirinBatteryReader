import React, { useState, useRef } from 'react';
import { decodeScooterPacket } from './scooterDecoder';
import './App.css';

export default function App() {
  const [isSupported] = useState(() => Boolean(navigator.bluetooth));
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [statusMessage, setStatusMessage] = useState(() => 
    navigator.bluetooth ? 'Disconnected' : 'Web Bluetooth API is not supported on this browser/device.'
  );
  const [activeCharacteristicUuid, setActiveCharacteristicUuid] = useState(null);

  // Telemetry state
  const [speed, setSpeed] = useState(null);
  const [voltage, setVoltage] = useState(null);
  const [rawLog, setRawLog] = useState([]);

  // Device Scanner state
  const [scannedDevices, setscannedDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [activeScan, setActiveScan] = useState(null);

  // Refs to hold active characteristic listeners/notifications for cleanup
  const activeCharacteristicsRef = useRef([]);

  // Handle disconnection event
  const handleDisconnection = () => {
    console.warn('[BLE] Scooter disconnected');
    setIsConnected(false);
    setActiveCharacteristicUuid(null);
    setStatusMessage('Disconnected from scooter');
    setSpeed(null);
    setVoltage(null);
    
    // Clear active characteristics refs
    activeCharacteristicsRef.current = [];
  };

  const connectScooter = async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not supported on this browser.');
      return;
    }

    try {
      setStatusMessage('Scanning for KuKirin G2...');
      console.log('[BLE] Requesting Bluetooth Device...');

      // Request device with service FFF0 or name prefix/filters
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [0xfff0] },
          { namePrefix: 'KuKirin' },
          { namePrefix: 'G2' },
          { namePrefix: 'KK' },
          { namePrefix: 'SCOOTER' }
        ],
        optionalServices: [0xfff0]
      });

      setDevice(selectedDevice);
      setStatusMessage(`Connecting to ${selectedDevice.name || 'Scooter'}...`);
      console.log(`[BLE] Connecting to GATT server of ${selectedDevice.name}...`, selectedDevice.id);

      selectedDevice.addEventListener('gattserverdisconnected', handleDisconnection);

      const gattServer = await selectedDevice.gatt.connect();
      console.log('[BLE] Connected to GATT Server');

      setStatusMessage('Discovering services (FFF0)...');
      
      // Get primary service FFF0
      let service;
      try {
        service = await gattServer.getPrimaryService(0xfff0);
        console.log('[BLE] Primary service FFF0 discovered');
      } catch (err) {
        console.error('[BLE] Service FFF0 not found:', err);
        throw new Error('Required service FFF0 not found on scooter.');
      }

      // Discover characteristics: FFF1 and FFF2 (FFF3 is not present)
      setStatusMessage('Discovering characteristics...');
      const targetUuids = [0xfff1, 0xfff2];
      let subscribedCount = 0;

      for (const uuid of targetUuids) {
        try {
          const characteristic = await service.getCharacteristic(uuid);
          console.log(`[BLE] Found characteristic: 0x${uuid.toString(16).toUpperCase()}`);
          console.log(`[BLE] Properties for 0x${uuid.toString(16).toUpperCase()}:`, {
            broadcast: characteristic.properties.broadcast,
            read: characteristic.properties.read,
            writeWithoutResponse: characteristic.properties.writeWithoutResponse,
            write: characteristic.properties.write,
            notify: characteristic.properties.notify,
            indicate: characteristic.properties.indicate,
          });

          // Check if notifications are supported
          if (characteristic.properties.notify || characteristic.properties.indicate) {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
              const value = event.target.value;
              const uuidStr = `0x${uuid.toString(16).toUpperCase()}`;
              setActiveCharacteristicUuid(uuidStr);

              // Decode using external decoder module
              const decoded = decodeScooterPacket(value, uuidStr);
              
              // Keep rolling log of last 20 raw packets for debugging
              setRawLog(prev => [{
                time: new Date().toLocaleTimeString(),
                char: uuidStr,
                hex: decoded.hex
              }, ...prev.slice(0, 19)]);

              if (decoded.speed !== null) setSpeed(decoded.speed);
              if (decoded.voltage !== null) setVoltage(decoded.voltage);
            });

            activeCharacteristicsRef.current.push(characteristic);
            subscribedCount++;
            console.log(`[BLE] Subscribed to notifications on 0x${uuid.toString(16).toUpperCase()}`);
          } else if (characteristic.properties.read) {
            // Read initial value if notify is not available
            const value = await characteristic.readValue();
            const uuidStr = `0x${uuid.toString(16).toUpperCase()}`;
            const decoded = decodeScooterPacket(value, uuidStr);
            if (decoded.speed !== null) setSpeed(decoded.speed);
            if (decoded.voltage !== null) setVoltage(decoded.voltage);
          }
        } catch (charErr) {
          console.warn(`[BLE] Characteristic 0x${uuid.toString(16).toUpperCase()} not available or accessible:`, charErr);
        }
      }

      if (subscribedCount === 0) {
        console.warn('[BLE] Warning: No notification characteristics could be subscribed under FFF0.');
      }

      // BLE connection succeeds
      setIsConnected(true);
      setStatusMessage('Connected');
      console.log('[BLE] Successfully connected and initialized scooter telemetry stream.');

    } catch (error) {
      console.error('[BLE Connection Error]:', error);
      setStatusMessage(`Connection failed: ${error.message || error}`);
      setIsConnected(false);
      if (device && device.gatt.connected) {
        device.gatt.disconnect();
      }
    }
  };

  // Nearby BLE Scanner Handler
  const startBleScan = async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not supported on this browser.');
      return;
    }

    setScanError(null);
    setIsScanning(true);

    try {
      // 1. Try requestLEScan if supported (Chrome Android flag / Experimental Web Platform features)
      if (navigator.bluetooth.requestLEScan) {
        try {
          const scan = await navigator.bluetooth.requestLEScan({ acceptAllAdvertisements: true });
          setActiveScan(scan);
          console.log('[BLE Scan] Active LE Scan started successfully');

          const abortController = new AbortController();
          const handleAd = (event) => {
            const advDevice = event.device;
            const entry = {
              id: advDevice.id,
              name: advDevice.name || 'Unknown Device',
              rssi: event.rssi !== undefined ? `${event.rssi} dBm` : 'N/A',
              connectable: event.connectable !== undefined ? (event.connectable ? 'Yes' : 'No') : 'Unknown',
              connected: advDevice.gatt?.connected ? 'Connected' : 'Disconnected',
              rawDevice: advDevice
            };

            setscannedDevices(prev => {
              const existingIdx = prev.findIndex(d => d.id === entry.id);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = entry;
                return updated;
              } else {
                return [...prev, entry];
              }
            });
          };

          navigator.bluetooth.addEventListener('advertisementreceived', handleAd, { signal: abortController.signal });

          // Auto stop LE scan after 15 seconds
          setTimeout(() => {
            if (abortController.signal.aborted === false) {
              abortController.abort();
              if (scan && scan.stop) {
                scan.stop();
              }
              setIsScanning(false);
              setActiveScan(null);
              console.log('[BLE Scan] LE Scan stopped automatically after timeout');
            }
          }, 15000);

          return;
        } catch (leErr) {
          console.warn('[BLE Scan] requestLEScan not permitted or failed, falling back to requestDevice prompt:', leErr);
        }
      }

      // 2. Standard Web Bluetooth fallback: requestDevice browser selection prompt
      console.log('[BLE Scan] Using requestDevice picker prompt for device discovery...');
      const pickedDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [0xfff0]
      });

      const entry = {
        id: pickedDevice.id,
        name: pickedDevice.name || 'Unknown Device',
        rssi: 'N/A',
        connectable: 'Unknown',
        connected: pickedDevice.gatt?.connected ? 'Connected' : 'Disconnected',
        rawDevice: pickedDevice
      };

      setscannedDevices(prev => {
        if (prev.some(d => d.id === entry.id)) return prev;
        return [...prev, entry];
      });
      setIsScanning(false);

    } catch (scanErr) {
      console.error('[BLE Scan Error]:', scanErr);
      setScanError(scanErr.message || 'Scan cancelled or failed.');
      setIsScanning(false);
    }
  };

  const stopBleScan = () => {
    if (activeScan && activeScan.stop) {
      try {
        activeScan.stop();
      } catch (e) {
        console.error(e);
      }
    }
    setActiveScan(null);
    setIsScanning(false);
  };

  const connectToScannedDevice = async (scannedEntry) => {
    try {
      const targetDevice = scannedEntry.rawDevice;
      if (!targetDevice) return;

      console.log(`[BLE Scan] Connecting to selected device: ${targetDevice.name || targetDevice.id}`);
      const gattServer = await targetDevice.gatt.connect();
      console.log('[BLE Scan] Connected to GATT server of selected device:', gattServer);
      alert(`Successfully connected to ${targetDevice.name || 'Device'}!`);

      setscannedDevices(prev => prev.map(d => d.id === scannedEntry.id ? { ...d, connected: 'Connected' } : d));
    } catch (err) {
      console.error('[BLE Scan Connect Error]:', err);
      alert(`Failed to connect: ${err.message || err}`);
    }
  };

  const disconnectScooter = () => {
    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
    handleDisconnection();
  };

  return (
    <div className="scooter-app">
      <header className="app-header">
        <div className="brand">
          <h1>KuKirin G2</h1>
          <span className="subtitle">Telemetry Dashboard</span>
        </div>
        <div className="connection-pill">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">{statusMessage}</span>
        </div>
      </header>

      {!isSupported ? (
        <div className="card error-card">
          <h2>Browser Not Supported</h2>
          <p>
            Web Bluetooth API is not supported by your browser or device.
          </p>
          <p className="note">
            <strong>iOS Users:</strong> Apple's iOS Safari does not support Web Bluetooth. Please use an Android device with Chrome, or a desktop browser (Chrome/Edge/Opera) with Bluetooth enabled.
          </p>
        </div>
      ) : (
        <main className="dashboard-main">
          {/* Connection Control Section */}
          <div className="control-section">
            {!isConnected ? (
              <button className="btn-connect" onClick={connectScooter}>
                Connect Scooter
              </button>
            ) : (
              <button className="btn-disconnect" onClick={disconnectScooter}>
                Disconnect Scooter
              </button>
            )}

            {/* Nearby Scanner Section */}
            <div className="scanner-control-group">
              {!isScanning ? (
                <button className="btn-scan" onClick={startBleScan}>
                  Scan Devices
                </button>
              ) : (
                <button className="btn-stop-scan" onClick={stopBleScan}>
                  Stop Scanning
                </button>
              )}
            </div>

            {scanError && <div className="scan-error-msg">{scanError}</div>}

            {scannedDevices.length > 0 && (
              <div className="scanned-devices-container">
                <h3>Discovered Bluetooth Devices ({scannedDevices.length})</h3>
                <div className="device-list">
                  {scannedDevices.map(entry => (
                    <div key={entry.id} className="device-item">
                      <div className="device-meta">
                        <span className="device-name">{entry.name}</span>
                        <span className="device-id">ID: {entry.id}</span>
                        <div className="device-details-row">
                          <span>RSSI: {entry.rssi}</span>
                          <span>Connectable: {entry.connectable}</span>
                          <span className={`device-status ${entry.connected === 'Connected' ? 'connected' : ''}`}>
                            {entry.connected}
                          </span>
                        </div>
                      </div>
                      <button className="btn-connect-device" onClick={() => connectToScannedDevice(entry)}>
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeCharacteristicUuid && (
              <div className="active-char-info">
                Active RX: <code>{activeCharacteristicUuid}</code>
              </div>
            )}
          </div>

          {/* Telemetry Display Cards (Only Speed and Voltage) */}
          <div className="telemetry-grid">
            <div className="telemetry-card">
              <div className="card-label">Speed</div>
              <div className="card-value-container">
                <span className="card-value">
                  {speed !== null ? speed.toFixed(1) : 'Waiting for data'}
                </span>
                {speed !== null && <span className="card-unit">km/h</span>}
              </div>
            </div>

            <div className="telemetry-card">
              <div className="card-label">Battery Voltage</div>
              <div className="card-value-container">
                <span className="card-value">
                  {voltage !== null ? voltage.toFixed(1) : 'Waiting for data'}
                </span>
                {voltage !== null && <span className="card-unit">V</span>}
              </div>
            </div>
          </div>

          {/* Development Raw Log Inspector */}
          {isConnected && (
            <div className="debug-log-card">
              <h3>Live BLE Packet Inspector (Console Logged)</h3>
              <div className="log-scroll">
                {rawLog.length === 0 ? (
                  <p className="no-logs">Listening for incoming BLE notifications...</p>
                ) : (
                  rawLog.map((log, idx) => (
                    <div key={idx} className="log-entry">
                      <span className="log-time">[{log.time}]</span>
                      <span className="log-char">{log.char}:</span>
                      <span className="log-hex">{log.hex}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="app-footer">
        <p>KuKirin G2 2025 • Direct BLE GATT Client</p>
      </footer>
    </div>
  );
}
